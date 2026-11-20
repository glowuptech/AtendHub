begin;

create table public.atendhub_appointment_response_events (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null unique references public.atendhub_eve_reminders(id),
  event_type text not null check(event_type in ('appointment.patient_confirmed','appointment.reschedule_requested')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  lease_until timestamptz,
  delivered_at timestamptz
);
alter table public.atendhub_appointment_response_events enable row level security;
revoke all on public.atendhub_appointment_response_events from public,anon,authenticated,atendhub_integration;
create index atendhub_appointment_response_pending on public.atendhub_appointment_response_events(created_at)
  where delivered_at is null;

create function public.atendhub_enqueue_appointment_response() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.atendhub_appointments; c public.atendhub_inbox_conversations; kind text; body text; previous text; moment text;
begin
  if new.confirmation_channel='link' and old.confirmed_at is null and new.confirmed_at is not null then
    kind:='appointment.patient_confirmed';
  elsif old.declined_at is null and new.declined_at is not null then
    kind:='appointment.reschedule_requested';
  else return new;
  end if;
  select * into strict a from public.atendhub_appointments where id=new.appointment_id;
  if kind='appointment.reschedule_requested' then
    select stage into previous from public.atendhub_leads where id=a.lead_id for update;
    if previous is distinct from 'rescheduling' then
      update public.atendhub_leads set stage='rescheduling',updated_at=now() where id=a.lead_id;
      insert into public.atendhub_lead_events(organization_id,lead_id,actor_id,event_type,from_stage,to_stage,metadata)
      values(a.organization_id,a.lead_id,null,'stage_changed',previous,'rescheduling',jsonb_build_object('appointmentId',a.id,'source','confirmation_link'));
    end if;
  end if;
  select conv.* into c from public.atendhub_inbox_conversations conv
    join public.atendhub_whatsapp_connections w on w.id=conv.connection_id
    where conv.lead_id=a.lead_id and conv.client_id=a.client_id and conv.organization_id=a.organization_id
      and (conv.id=new.conversation_id or (new.conversation_id is null and conv.status='open' and w.status='connected'
        and not exists (select 1 from public.atendhub_inbox_conversations other
          join public.atendhub_whatsapp_connections ow on ow.id=other.connection_id and ow.status='connected'
          where other.lead_id=a.lead_id and other.organization_id=a.organization_id and other.client_id=a.client_id
            and other.status='open' and other.id<>conv.id)))
    limit 1;
  moment:=to_char(a.starts_at at time zone a.timezone,'DD/MM/YYYY às HH24:MI');
  body:=case when kind='appointment.patient_confirmed'
    then 'Sua presença está confirmada para '||moment||'. Até a consulta!'
    else 'Recebemos seu pedido de reagendamento. Qual dia e horário funcionam melhor para você?' end;
  insert into public.atendhub_appointment_response_events(reminder_id,event_type,payload)
  values(new.id,kind,jsonb_build_object('appointmentId',a.id,'clientId',a.client_id,'leadId',a.lead_id,
    'professionalId',a.professional_id,'startsAt',a.starts_at,'timezone',a.timezone,'conversationId',c.id,
    'patient',jsonb_build_object('phone',c.phone,'instance',(select instance_name from public.atendhub_whatsapp_connections where id=c.connection_id),'body',body)))
  on conflict(reminder_id) do nothing;
  return new;
end $$;
revoke all on function public.atendhub_enqueue_appointment_response() from public,anon,authenticated;
create trigger atendhub_appointment_response_event after update of confirmed_at,declined_at
  on public.atendhub_eve_reminders for each row execute function public.atendhub_enqueue_appointment_response();

create function public.atendhub_claim_appointment_response(p_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.atendhub_appointment_response_events;
begin
  select * into e from public.atendhub_appointment_response_events
    where (p_id is null or id=p_id) and delivered_at is null and (lease_until is null or lease_until<=now())
    order by created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.atendhub_appointment_response_events set lease_until=now()+interval '5 minutes' where id=e.id;
  return e.payload||jsonb_build_object('id',e.id,'eventType',e.event_type,'occurredAt',e.created_at);
end $$;
create function public.atendhub_ack_appointment_response(p_id uuid) returns void
language sql security definer set search_path='' as $$
  update public.atendhub_appointment_response_events set delivered_at=coalesce(delivered_at,now()) where id=p_id and lease_until is not null;
$$;
revoke all on function public.atendhub_claim_appointment_response(uuid),public.atendhub_ack_appointment_response(uuid) from public,anon,authenticated;
grant execute on function public.atendhub_claim_appointment_response(uuid),public.atendhub_ack_appointment_response(uuid) to service_role,atendhub_integration;

create or replace function public.atendhub_confirmation_public(p_token uuid,p_decision text default null,p_client uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.atendhub_appointments; r public.atendhub_eve_reminders; state text; clinic text;
begin
  select ap.* into a from public.atendhub_appointments ap join public.atendhub_eve_reminders e on e.appointment_id=ap.id
    where e.public_token=p_token and e.slot=1 and (p_client is null or ap.client_id=p_client) for update of ap;
  if not found then return null; end if;
  select * into r from public.atendhub_eve_reminders where public_token=p_token for update;
  if a.starts_at<>r.starts_at or a.status='cancelled' then return null; end if;
  if r.declined_at is not null and a.status='rescheduling' then
    state:='declined';
  elsif r.invalidated_at is not null or a.status not in ('awaiting_confirmation','confirmed') then
    return null;
  elsif exists(select 1 from public.atendhub_eve_reminders e where e.appointment_id=a.id
    and e.invalidated_at is null and e.confirmed_at is not null) then
    state:='confirmed';
  elsif now()>=a.starts_at-interval '30 minutes' then
    state:='expired';
  elsif p_decision='confirm' then
    perform public.atendhub_eve_finish(r.id,now(),'link',null,null);
    state:='confirmed';
  elsif p_decision='decline' then
    update public.atendhub_eve_reminders set declined_at=now() where id=r.id;
    -- The existing agenda status blocks reminders and retains the slot.
    update public.atendhub_appointments set status='rescheduling',updated_at=now() where id=a.id;
    state:='declined';
  elsif p_decision is null then
    state:='pending';
  else
    raise exception 'INVALID_DECISION';
  end if;
  select name into clinic from public.atendhub_clients where id=a.client_id and organization_id=a.organization_id;
  return jsonb_build_object('state',state,'clinic',clinic,
    'eventId',case when p_decision is not null then (select id from public.atendhub_appointment_response_events where reminder_id=r.id) end,
    'when',to_char(a.starts_at at time zone a.timezone,'DD/MM/YYYY às HH24:MI'),
    'deadline',to_char((a.starts_at-interval '30 minutes') at time zone a.timezone,'DD/MM/YYYY às HH24:MI'));
end $$;

-- Provider ID and body are the evidence of what the patient actually received.
create function public.atendhub_record_provider_text(
  p_conversation uuid,p_provider_id text,p_sent_at timestamptz,p_body text
) returns void language plpgsql security definer set search_path='' as $$
declare c public.atendhub_inbox_conversations; recorded uuid;
begin
  if coalesce(length(trim(p_provider_id)),0) not between 1 and 200 or p_sent_at is null
    or p_sent_at>now()+interval '5 minutes' or coalesce(length(p_body),0) not between 1 and 6000
    then raise exception 'INVALID_DELIVERY'; end if;
  select * into strict c from public.atendhub_inbox_conversations where id=p_conversation;
  perform pg_advisory_xact_lock(hashtextextended('atendhub_inbox:'||c.client_id::text||':'||c.phone,0));
  insert into public.atendhub_inbox_messages(organization_id,client_id,connection_id,conversation_id,
    provider_message_id,direction,origin,message_type,body,occurred_at,status)
  values(c.organization_id,c.client_id,c.connection_id,c.id,p_provider_id,'outbound','external_device','text',p_body,p_sent_at,
    coalesce((select status from public.atendhub_inbox_message_receipts where connection_id=c.connection_id and provider_message_id=p_provider_id),'sent'))
  on conflict(connection_id,provider_message_id) where provider_message_id is not null do update
    set body=excluded.body,updated_at=now()
    where atendhub_inbox_messages.conversation_id=c.id and atendhub_inbox_messages.direction='outbound'
      and atendhub_inbox_messages.origin='external_device'
  returning id into recorded;
  if recorded is null then raise exception 'DELIVERY_MESSAGE_CONFLICT'; end if;
  update public.atendhub_inbox_unresolved set resolved_at=now()
    where connection_id=c.connection_id and provider_message_id=p_provider_id and resolved_at is null;
  perform public.atendhub_inbox_refresh_conversation(c.id);
end $$;
revoke all on function public.atendhub_record_provider_text(uuid,text,timestamptz,text) from public,anon,authenticated,atendhub_integration;

create function public.atendhub_eve_sent(p_id uuid,p_instance text,p_provider_id text,p_sent_at timestamptz,p_body text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.atendhub_appointments; r public.atendhub_eve_reminders; c public.atendhub_inbox_conversations; link text;
begin
  select conv.* into strict c from public.atendhub_inbox_conversations conv
    join public.atendhub_eve_reminders e on e.conversation_id=conv.id
    join public.atendhub_whatsapp_connections w on w.id=conv.connection_id
    where e.id=p_id and w.instance_name=p_instance;
  perform pg_advisory_xact_lock(hashtextextended('atendhub_inbox:'||c.client_id::text||':'||c.phone,0));
  select ap.* into strict a from public.atendhub_appointments ap join public.atendhub_eve_reminders e on e.appointment_id=ap.id
    where e.id=p_id for update of ap;
  select * into strict r from public.atendhub_eve_reminders where id=p_id and conversation_id=c.id for update;
  if r.first_attempt_at is null or p_sent_at is null or p_sent_at<date_trunc('second',r.first_attempt_at)
    or p_sent_at>=r.starts_at or (r.sent_at is not null and r.provider_id is distinct from p_provider_id)
    then raise exception 'INVALID_DELIVERY'; end if;
  link:=substring(r.outbound_body from 'https://[^[:space:]]+/confirmar/[A-Za-z0-9_-]+$');
  if link is not null and (p_body is null or strpos(p_body,link)=0) then raise exception 'DELIVERY_LINK_MISMATCH'; end if;
  perform public.atendhub_record_provider_text(c.id,p_provider_id,p_sent_at,p_body);
  update public.atendhub_eve_reminders set sent_at=coalesce(sent_at,p_sent_at),send_channel='whatsapp',provider_id=p_provider_id where id=r.id;
  if not r.notification_only then perform public.atendhub_eve_reconcile(r.id); end if;
end $$;
revoke all on function public.atendhub_eve_sent(uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.atendhub_eve_sent(uuid,text,text,timestamptz,text) to atendhub_integration;

create function public.atendhub_record_appointment_response_message(p_id uuid,p_provider_id text,p_sent_at timestamptz,p_body text)
returns void language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
  select (payload->>'conversationId')::uuid into strict c from public.atendhub_appointment_response_events where id=p_id and lease_until is not null;
  if c is null then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  perform public.atendhub_record_provider_text(c,p_provider_id,p_sent_at,p_body);
end $$;
revoke all on function public.atendhub_record_appointment_response_message(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.atendhub_record_appointment_response_message(uuid,text,timestamptz,text) to atendhub_integration;
commit;
