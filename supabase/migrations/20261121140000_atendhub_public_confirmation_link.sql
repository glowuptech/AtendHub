begin;
alter table public.atendhub_eve_reminders
  add column public_token uuid not null default gen_random_uuid() unique,
  add column declined_at timestamptz;
alter table public.atendhub_eve_reminders
  drop constraint atendhub_eve_reminders_confirmation_channel_check,
  add constraint atendhub_eve_reminders_confirmation_channel_check
    check(confirmation_channel in ('whatsapp','phone','link'));

-- Only the reception team can retrieve a link to share.
create function public.atendhub_confirmation_link(p_org uuid,p_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select r.public_token from public.atendhub_eve_reminders r
    join public.atendhub_appointments a on a.id=r.appointment_id
    where r.id=p_id and r.slot=1 and r.invalidated_at is null
      and a.organization_id=p_org and a.status in ('awaiting_confirmation','confirmed')
      and a.starts_at>now()+interval '30 minutes'
      and public.atendhub_is_active_member(p_org)
      and public.atendhub_calendar_allows(p_org,a.client_id,'edit',a.lead_id,a.created_by_id);
$$;
revoke all on function public.atendhub_confirmation_link(uuid,uuid) from public,anon;
grant execute on function public.atendhub_confirmation_link(uuid,uuid) to authenticated;

create or replace function public.atendhub_eve_finish(p_id uuid,p_at timestamptz,p_channel text,p_actor uuid,p_message uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.atendhub_appointments; r public.atendhub_eve_reminders; previous public.atendhub_leads.stage%type;
begin
  select ap.* into strict a from public.atendhub_appointments ap join public.atendhub_eve_reminders e on e.appointment_id=ap.id
    where e.id=p_id for update of ap;
  select * into strict r from public.atendhub_eve_reminders where id=p_id for update;
  if r.confirmed_at is not null then return; end if;
  if r.invalidated_at is not null or a.status not in ('awaiting_confirmation','confirmed')
    or (p_channel<>'link' and (r.sent_at is null or p_at<r.sent_at)) or p_at>=a.starts_at then raise exception 'STALE_REMINDER'; end if;
  update public.atendhub_eve_reminders set confirmed_at=p_at,confirmation_channel=p_channel,
    confirmed_by=p_actor,response_message_id=p_message where id=p_id;
  update public.atendhub_appointments set status='confirmed',updated_at=now() where id=a.id;
  select stage into previous from public.atendhub_leads where id=a.lead_id for update;
  update public.atendhub_leads set qualified_at=coalesce(qualified_at,p_at),stage='confirmed',updated_at=now() where id=a.lead_id;
  if previous<>'confirmed' then
    insert into public.atendhub_lead_events(organization_id,lead_id,actor_id,event_type,from_stage,to_stage,metadata)
    values(a.organization_id,a.lead_id,p_actor,'stage_changed',previous,'confirmed',jsonb_build_object('appointmentId',a.id,'reminderId',r.id));
  end if;
end $$;


-- Bearer token access is limited to this one occurrence and minimal public details.
create function public.atendhub_confirmation_public(p_token uuid,p_decision text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.atendhub_appointments; r public.atendhub_eve_reminders; state text; clinic text;
begin
  select ap.* into a from public.atendhub_appointments ap join public.atendhub_eve_reminders e on e.appointment_id=ap.id
    where e.public_token=p_token and e.slot=1 for update of ap;
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
    'when',to_char(a.starts_at at time zone a.timezone,'DD/MM/YYYY às HH24:MI'),
    'deadline',to_char((a.starts_at-interval '30 minutes') at time zone a.timezone,'DD/MM/YYYY às HH24:MI'));
end $$;
revoke all on function public.atendhub_confirmation_public(uuid,text) from public,anon,authenticated,atendhub_integration;
grant execute on function public.atendhub_confirmation_public(uuid,text) to service_role;
drop function public.atendhub_eve_list(uuid,uuid);
create or replace function public.atendhub_eve_list(p_org uuid,p_client uuid) returns table(
  id uuid, appointment_id uuid, lead_name text, professional text, starts_at timestamptz, sent_at timestamptz,
  confirmed_at timestamptz, dispatching boolean, can_edit boolean, is_eve boolean, due_at timestamptz, slot smallint, purpose text, declined_at timestamptz)
language sql stable security definer set search_path='' as $$
  select r.id,a.id,l.name::text,p.name::text,a.starts_at,r.sent_at,r.confirmed_at,
    r.first_attempt_at is not null and r.sent_at is null,
    public.atendhub_calendar_allows(p_org,p_client,'edit',a.lead_id,a.created_by_id),
    true, public.atendhub_reminder_due(r.id), r.slot, case when r.notification_only or (r.slot=2 and r.first_attempt_at is null and r.sent_at is null) then 'reminder' else 'confirmation' end, r.declined_at
  from public.atendhub_eve_reminders r join public.atendhub_appointments a on a.id=r.appointment_id
  join public.atendhub_leads l on l.id=a.lead_id join public.atendhub_professionals p on p.id=a.professional_id
  where a.organization_id=p_org and a.client_id=p_client and (r.invalidated_at is null or (r.declined_at is not null and a.status='rescheduling' and r.starts_at=a.starts_at))
    and public.atendhub_is_active_member(p_org)
    and public.atendhub_calendar_allows(p_org,p_client,'view',a.lead_id,a.created_by_id)
    and a.starts_at>now()
    and ((r.slot=1 and (a.status='awaiting_confirmation' or r.declined_at is not null)) or r.sent_at is not null or (a.status in ('awaiting_confirmation','confirmed') and public.atendhub_reminder_due(r.id)<a.starts_at))
  order by a.starts_at,r.slot;
$$;

revoke all on function public.atendhub_eve_list(uuid,uuid) from public,anon;
grant execute on function public.atendhub_eve_list(uuid,uuid) to authenticated;
commit;
