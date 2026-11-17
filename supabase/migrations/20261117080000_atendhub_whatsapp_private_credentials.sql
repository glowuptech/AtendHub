begin;

create table public.atendhub_whatsapp_connection_credentials (
  connection_id uuid primary key,
  organization_id uuid not null,
  api_key text not null check (length(api_key) between 1 and 4096),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint atendhub_whatsapp_connection_credentials_connection_org_fkey
    foreign key (connection_id, organization_id)
    references public.atendhub_whatsapp_connections (id, organization_id)
    on delete cascade
);

alter table public.atendhub_whatsapp_connection_credentials enable row level security;
revoke all on public.atendhub_whatsapp_connection_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.atendhub_whatsapp_connection_credentials to service_role;

-- Persist the action result and its private credential atomically. Only the most
-- recent action for this connection may update its credential.
drop function public.atendhub_whatsapp_apply_response(uuid, text, text);

create function public.atendhub_whatsapp_apply_response(
  p_event_id uuid,
  p_delivery_status text,
  p_result_status text default null,
  p_api_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.atendhub_whatsapp_events;
  c public.atendhub_whatsapp_connections;
  final_status text;
  is_current boolean;
begin
  if p_delivery_status not in ('delivered', 'retry') then
    raise exception 'INVALID_DELIVERY_STATUS';
  end if;
  if p_delivery_status = 'retry' and (p_result_status is not null or p_api_key is not null) then
    raise exception 'RETRY_CANNOT_HAVE_RESULT';
  end if;
  if p_api_key is not null and (length(pg_catalog.btrim(p_api_key)) = 0 or length(p_api_key) > 4096) then
    raise exception 'INVALID_API_KEY';
  end if;

  select * into ev
  from public.atendhub_whatsapp_events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  select * into c
  from public.atendhub_whatsapp_connections
  where id = ev.connection_id
    and organization_id = ev.organization_id
  for update;
  if not found then
    raise exception 'CONNECTION_NOT_FOUND';
  end if;

  if p_result_status is not null then
    if (ev.event_type = 'whatsapp.connection.create_requested'
        and p_result_status <> 'awaiting_confirmation')
      or (ev.event_type = 'whatsapp.connection.confirm_requested'
        and p_result_status not in ('connected', 'disconnected', 'awaiting_confirmation'))
      or (ev.event_type = 'whatsapp.connection.update_requested'
        and p_result_status not in ('connected', 'disconnected', 'awaiting_confirmation'))
      or (ev.event_type = 'whatsapp.connection.delete_requested'
        and p_result_status <> 'deleted') then
      raise exception 'INVALID_TRANSITION';
    end if;
    if ev.result_status is not null and ev.result_status <> p_result_status then
      raise exception 'RESULT_CONFLICT';
    end if;
  end if;

  final_status := coalesce(p_result_status, ev.result_status);
  is_current := c.last_event_id = ev.id;

  update public.atendhub_whatsapp_events
  set delivery_status = case
        when final_status is not null then 'delivered'
        else p_delivery_status
      end,
      attempts = attempts + 1,
      delivered_at = case
        when final_status is not null or p_delivery_status = 'delivered' then coalesce(delivered_at, pg_catalog.now())
        else null
      end,
      result_status = final_status
  where id = ev.id;

  if is_current and p_delivery_status = 'delivered' and final_status is not null then
    update public.atendhub_whatsapp_connections
    set status = final_status,
        updated_at = pg_catalog.now()
    where id = c.id
      and organization_id = ev.organization_id;
  end if;

  if is_current and p_delivery_status = 'delivered' and p_api_key is not null then
    insert into public.atendhub_whatsapp_connection_credentials
      (connection_id, organization_id, api_key, updated_at)
    values (ev.connection_id, ev.organization_id, p_api_key, pg_catalog.now())
    on conflict (connection_id) do update
      set api_key = excluded.api_key,
          organization_id = excluded.organization_id,
          updated_at = excluded.updated_at;
  end if;

  return pg_catalog.jsonb_build_object(
    'received', p_delivery_status = 'delivered',
    'applied', is_current and p_delivery_status = 'delivered' and final_status is not null,
    'stale', not is_current,
    'status', final_status
  );
end;
$$;

revoke all on function public.atendhub_whatsapp_apply_response(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.atendhub_whatsapp_apply_response(uuid, text, text, text)
  to service_role;

commit;
