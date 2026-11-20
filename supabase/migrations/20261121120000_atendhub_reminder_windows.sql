begin;
create table public.atendhub_reminder_settings (
  client_id uuid primary key references public.atendhub_clients(id),
  advance_minutes integer not null check(advance_minutes between 1 and 10080),
  same_day_minutes integer not null check(same_day_minutes between 1 and 1439),
  reminder_count integer not null check(reminder_count in (1,2)),
  second_minutes integer not null check(second_minutes between 1 and 1439),
  check(reminder_count=1 or second_minutes<least(advance_minutes,same_day_minutes))
);
alter table public.atendhub_reminder_settings enable row level security;
revoke all on public.atendhub_reminder_settings from public,anon,authenticated,atendhub_integration;

create function public.atendhub_reminder_preferences(
  p_org uuid,p_client uuid,p_advance integer default null,p_same_day integer default null,
  p_count integer default null,p_second integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare settings public.atendhub_reminder_settings; can_edit boolean;
begin
  if not public.atendhub_is_active_member(p_org)
    or not public.atendhub_has_client_access(p_org,p_client)
    or not exists(select 1 from public.atendhub_clients where id=p_client and organization_id=p_org)
    then raise insufficient_privilege; end if;
  can_edit:=public.atendhub_calendar_manages(p_org,p_client);
  if p_count is not null then
    if not can_edit then raise insufficient_privilege; end if;
    insert into public.atendhub_reminder_settings values(p_client,p_advance,p_same_day,p_count,p_second)
      on conflict(client_id) do update set advance_minutes=excluded.advance_minutes,
        same_day_minutes=excluded.same_day_minutes,reminder_count=excluded.reminder_count,second_minutes=excluded.second_minutes;
  end if;
  select * into settings from public.atendhub_reminder_settings where client_id=p_client;
  return jsonb_build_object('advance',coalesce(settings.advance_minutes,1440),'sameDay',coalesce(settings.same_day_minutes,120),
    'count',coalesce(settings.reminder_count,1),'second',coalesce(settings.second_minutes,30),'canEdit',can_edit);
end $$;
revoke all on function public.atendhub_reminder_preferences(uuid,uuid,integer,integer,integer,integer) from public,anon;
grant execute on function public.atendhub_reminder_preferences(uuid,uuid,integer,integer,integer,integer) to authenticated;

alter table public.atendhub_eve_reminders add column slot smallint not null default 1 check(slot in (1,2));
drop index public.atendhub_eve_current;
create unique index atendhub_eve_current on public.atendhub_eve_reminders(appointment_id,slot) where invalidated_at is null;

-- The first reminder can become due immediately after a late booking. A second reminder
-- requires an acknowledged first dispatch and at least 30 minutes of separation.
create function public.atendhub_reminder_due(p_id uuid) returns timestamptz
language sql stable set search_path='' as $$
 select case when r.slot=1 then a.starts_at-make_interval(mins=>case
   when (greatest(a.created_at,coalesce(rbook.created_at,a.created_at)) at time zone a.timezone)::date=(a.starts_at at time zone a.timezone)::date
     then coalesce(s.same_day_minutes,120) else coalesce(s.advance_minutes,1440) end)
   when s.reminder_count=2 then greatest(a.starts_at-make_interval(mins=>s.second_minutes),first.sent_at+interval '30 minutes')
   end
 from public.atendhub_eve_reminders r join public.atendhub_appointments a on a.id=r.appointment_id
 left join public.atendhub_reminder_settings s on s.client_id=a.client_id
 left join public.atendhub_eve_reminders first on first.appointment_id=a.id and first.slot=1
   and first.invalidated_at is null and first.sent_at is not null
 left join lateral (select max(e.created_at) as created_at from public.atendhub_appointment_events e
   where e.appointment_id=a.id and e.event_type='rescheduled') rbook on true
 where r.id=p_id and (r.slot=1 or first.id is not null);
$$;
revoke all on function public.atendhub_reminder_due(uuid) from public,anon,authenticated;

create or replace function public.atendhub_eve_schedule() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (old.starts_at<>new.starts_at or new.status in ('cancelled','rescheduling')
    or old.lead_id<>new.lead_id or old.client_id<>new.client_id or old.professional_id<>new.professional_id) then
    update public.atendhub_eve_reminders set invalidated_at=now() where appointment_id=new.id and invalidated_at is null;
  end if;
  if new.status='awaiting_confirmation' and new.starts_at>now() then
    insert into public.atendhub_eve_reminders(appointment_id,starts_at,slot) values(new.id,new.starts_at,1),(new.id,new.starts_at,2)
      on conflict (appointment_id,slot) where invalidated_at is null do nothing;
  end if;
  return new;
end $$;

insert into public.atendhub_eve_reminders(appointment_id,starts_at,slot)
select appointment_id,starts_at,2 from public.atendhub_eve_reminders
where slot=1 and invalidated_at is null and starts_at>now()
on conflict (appointment_id,slot) where invalidated_at is null do nothing;
create or replace function public.atendhub_eve_claim(p_client uuid,p_instance text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item record;
begin
  select r.id,r.code,a.starts_at,a.timezone,c.id as conversation,c.phone into item
  from public.atendhub_eve_reminders r join public.atendhub_appointments a on a.id=r.appointment_id
  join public.atendhub_inbox_conversations c on c.lead_id=a.lead_id and c.client_id=a.client_id
    and c.organization_id=a.organization_id and c.status='open'
  join public.atendhub_whatsapp_connections w on w.id=c.connection_id
  where a.client_id=p_client and w.instance_name=p_instance and w.status='connected'
    and a.status='awaiting_confirmation' and r.invalidated_at is null and r.sent_at is null
    and (r.conversation_id=c.id or (r.conversation_id is null and not exists (
      select 1 from public.atendhub_inbox_conversations other where other.lead_id=a.lead_id
        and other.connection_id=c.connection_id and other.status='open' and other.id<>c.id)))
    and (r.lease_until is null or r.lease_until<=now())
    and a.starts_at>now() and public.atendhub_reminder_due(r.id)<=now()
  order by a.starts_at,r.id,c.id limit 1 for update of a,r skip locked;
  if not found then return null; end if;
  update public.atendhub_eve_reminders set conversation_id=item.conversation,
    lease_until=now()+interval '10 minutes',first_attempt_at=coalesce(first_attempt_at,now()) where id=item.id;
  return jsonb_build_object('requestId',item.id,'phone',item.phone,'instance',p_instance,
    'replyText','CONFIRMO '||item.code,'body',
    public.atendhub_eve_text(item.starts_at,item.timezone,item.code));
end $$;

create or replace function public.atendhub_eve_sent(p_id uuid,p_instance text,p_provider_id text,p_sent_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare r public.atendhub_eve_reminders; a public.atendhub_appointments; c public.atendhub_inbox_conversations;
begin
  select conv.* into strict c from public.atendhub_inbox_conversations conv join public.atendhub_eve_reminders e
    on e.conversation_id=conv.id where e.id=p_id;
  perform pg_advisory_xact_lock(hashtextextended('atendhub_inbox:'||c.client_id::text||':'||c.phone,0));
  select ap.* into strict a from public.atendhub_appointments ap join public.atendhub_eve_reminders e on e.appointment_id=ap.id
    where e.id=p_id for update of ap;
  select e.* into strict r from public.atendhub_eve_reminders e join public.atendhub_whatsapp_connections w on w.id=c.connection_id where e.id=p_id and w.instance_name=p_instance for update of e;
  if r.provider_id=p_provider_id then return; end if;
  if r.first_attempt_at is null or r.sent_at is not null or p_sent_at is null or p_sent_at<date_trunc('second',r.first_attempt_at)
    or p_sent_at>now()+interval '5 minutes' or p_sent_at>=r.starts_at
    or coalesce(length(trim(p_provider_id)),0) not between 1 and 200 then raise exception 'INVALID_DELIVERY'; end if;
  update public.atendhub_eve_reminders set sent_at=p_sent_at,send_channel='whatsapp',provider_id=p_provider_id where id=r.id;
  perform public.atendhub_ingest_whatsapp_message(p_instance,p_provider_id,c.remote_jid,true,'text',
    public.atendhub_eve_text(r.starts_at,a.timezone,r.code),p_sent_at);
  if not exists(select 1 from public.atendhub_inbox_messages m
    where m.connection_id=c.connection_id and m.conversation_id=c.id and m.direction='outbound'
      and m.provider_message_id=p_provider_id and m.body=public.atendhub_eve_text(r.starts_at,a.timezone,r.code)) then
    raise exception 'DELIVERY_MESSAGE_CONFLICT';
  end if;
  perform public.atendhub_eve_reconcile(r.id);
end $$;

create or replace function public.atendhub_eve_phone(p_org uuid,p_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.atendhub_appointments; r public.atendhub_eve_reminders;
begin
  select ap.* into strict a from public.atendhub_appointments ap join public.atendhub_eve_reminders e on e.appointment_id=ap.id
    where e.id=p_id and ap.organization_id=p_org for update of ap;
  if auth.uid() is null or not public.atendhub_is_active_member(p_org) or
    not public.atendhub_calendar_allows(p_org,a.client_id,'edit',a.lead_id,a.created_by_id) then raise insufficient_privilege; end if;
  select * into strict r from public.atendhub_eve_reminders where id=p_id for update;
  if r.invalidated_at is not null or a.starts_at<=now() or a.status not in ('awaiting_confirmation','confirmed') then raise exception 'STALE_REMINDER'; end if;
  if p_action='sent' then
    if r.send_channel='phone' then return; end if;
    if r.first_attempt_at is not null or r.sent_at is not null or
      public.atendhub_reminder_due(r.id) is null or r.slot=2 and public.atendhub_reminder_due(r.id)>now() then raise exception 'STALE_REMINDER'; end if;
    update public.atendhub_eve_reminders set sent_at=now(),send_channel='phone',sent_by=auth.uid() where id=r.id;
  elsif p_action='confirmed' then
    perform public.atendhub_eve_finish(r.id,now(),'phone',auth.uid(),null);
  else raise exception 'INVALID_ACTION'; end if;
end $$;

drop function public.atendhub_eve_list(uuid,uuid);
create or replace function public.atendhub_eve_list(p_org uuid,p_client uuid) returns table(
  id uuid, appointment_id uuid, lead_name text, professional text, starts_at timestamptz, sent_at timestamptz,
  confirmed_at timestamptz, dispatching boolean, can_edit boolean, is_eve boolean, due_at timestamptz, slot smallint)
language sql stable security definer set search_path='' as $$
  select r.id,a.id,l.name::text,p.name::text,a.starts_at,r.sent_at,r.confirmed_at,
    r.first_attempt_at is not null and r.sent_at is null,
    public.atendhub_calendar_allows(p_org,p_client,'edit',a.lead_id,a.created_by_id),
    true, public.atendhub_reminder_due(r.id), r.slot
  from public.atendhub_eve_reminders r join public.atendhub_appointments a on a.id=r.appointment_id
  join public.atendhub_leads l on l.id=a.lead_id join public.atendhub_professionals p on p.id=a.professional_id
  where a.organization_id=p_org and a.client_id=p_client and r.invalidated_at is null
    and public.atendhub_is_active_member(p_org)
    and public.atendhub_calendar_allows(p_org,p_client,'view',a.lead_id,a.created_by_id)
    and a.starts_at>now()
    and (r.slot=1 or r.sent_at is not null or (a.status='awaiting_confirmation' and public.atendhub_reminder_due(r.id)<a.starts_at))
  order by a.starts_at,r.slot;
$$;

revoke all on function public.atendhub_eve_list(uuid,uuid) from public,anon;
grant execute on function public.atendhub_eve_list(uuid,uuid) to authenticated;
commit;
