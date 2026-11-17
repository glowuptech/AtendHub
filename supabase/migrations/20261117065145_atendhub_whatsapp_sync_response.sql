begin;

create or replace function public.atendhub_whatsapp_apply_response(
  p_event_id uuid,
  p_delivery_status text,
  p_result_status text default null
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
  if p_delivery_status = 'retry' and p_result_status is not null then
    raise exception 'RETRY_CANNOT_HAVE_RESULT';
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

  return pg_catalog.jsonb_build_object(
    'received', p_delivery_status = 'delivered',
    'applied', is_current and p_delivery_status = 'delivered' and final_status is not null,
    'stale', not is_current,
    'status', final_status
  );
end;
$$;

revoke all on function public.atendhub_whatsapp_apply_response(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.atendhub_whatsapp_apply_response(uuid, text, text)
  to service_role;

drop function if exists public.atendhub_whatsapp_callback(uuid, uuid, text);

commit;
