create or replace function public.atendhub_update_client_with_professionals(
  _organization_id uuid,
  _client_id uuid,
  _operation_id uuid,
  _name text,
  _status text,
  _metadata jsonb,
  _professionals jsonb
) returns public.atendhub_clients
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_client public.atendhub_clients;
begin
  update public.atendhub_clients
     set operation_id = _operation_id, name = _name, status = _status, metadata = _metadata, updated_at = now()
   where id = _client_id and organization_id = _organization_id
  returning * into updated_client;

  if updated_client.id is null then
    raise exception using errcode = 'P0002', message = 'Cliente não encontrado ou fora do escopo.';
  end if;

  delete from public.atendhub_professionals p
   where p.client_id = _client_id and p.organization_id = _organization_id
     and not exists (
       select 1 from jsonb_to_recordset(coalesce(_professionals, '[]'::jsonb)) as incoming(id uuid)
       where incoming.id = p.id
     );

  insert into public.atendhub_professionals (id, organization_id, client_id, name, professional_type, crm, specialties, status)
  select incoming.id, _organization_id, _client_id, incoming.name, incoming.professional_type, incoming.crm, incoming.specialties, incoming.status
    from jsonb_to_recordset(coalesce(_professionals, '[]'::jsonb)) as incoming(
      id uuid, name text, professional_type text, crm text, specialties text[], status text
    )
  on conflict (id) do update
    set name = excluded.name, professional_type = excluded.professional_type, crm = excluded.crm,
        specialties = excluded.specialties, status = excluded.status
  where public.atendhub_professionals.organization_id = _organization_id
    and public.atendhub_professionals.client_id = _client_id;

  return updated_client;
end;
$$;

revoke all on function public.atendhub_update_client_with_professionals(uuid, uuid, uuid, text, text, jsonb, jsonb) from public;
grant execute on function public.atendhub_update_client_with_professionals(uuid, uuid, uuid, text, text, jsonb, jsonb) to authenticated;
