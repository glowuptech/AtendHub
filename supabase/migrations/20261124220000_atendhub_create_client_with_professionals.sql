begin;

insert into public.atendhub_operations (organization_id, code, name, status)
select o.id, 'veredite', 'Veredit', 'active'
from public.atendhub_organizations o
where lower(o.name) = 'glowup' and o.status = 'active'
on conflict (organization_id, code) do update set status = 'active', updated_at = now()
where atendhub_operations.status <> 'active';

-- Use the existing client and professional RLS policies for authenticated writes.
create function public.atendhub_create_client_with_professionals(
  _organization_id uuid, _client_id uuid, _name text, _status text,
  _metadata jsonb, _professionals jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation_code text;
  operation_id uuid;
  professional_type text;
begin
  if not coalesce(public.atendhub_is_super_admin(_organization_id), false) then
    raise insufficient_privilege using message = 'Somente superadministradores podem criar clientes.';
  end if;

  case _metadata->>'vertical'
    when 'healthcare' then operation_code := 'prescrita'; professional_type := 'health';
    when 'legal' then operation_code := 'veredite'; professional_type := 'legal';
    else raise exception using errcode = '22023', message = 'Frente do cliente inválida.';
  end case;

  select o.id into operation_id from public.atendhub_operations o
    where o.organization_id = _organization_id and o.code = operation_code and o.status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'A operação ainda não está ativa nesta organização.';
  end if;

  insert into public.atendhub_clients (id, organization_id, operation_id, name, status, metadata)
  values (_client_id, _organization_id, operation_id, _name, _status, _metadata);

  insert into public.atendhub_professionals
    (id, organization_id, client_id, name, professional_type, crm, specialties, status)
  select p.id, _organization_id, _client_id, p.name, professional_type, p.crm,
         coalesce(p.specialties, '{}'), 'active'
  from jsonb_to_recordset(coalesce(_professionals, '[]'::jsonb))
    as p(id uuid, name text, crm text, specialties text[]);

  return _client_id;
end;
$$;

revoke all on function public.atendhub_create_client_with_professionals(uuid, uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.atendhub_create_client_with_professionals(uuid, uuid, text, text, jsonb, jsonb) to authenticated;

commit;
