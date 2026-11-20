begin;

-- One invitation per scheduling occurrence. Rescheduling back to an old time still issues a fresh ID.
create table public.atendhub_eve_reminders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.atendhub_appointments(id),
  starts_at timestamptz not null,
  code text not null unique default upper(left(replace(gen_random_uuid()::text,'-',''),16)),
  invalidated_at timestamptz,
  conversation_id uuid references public.atendhub_inbox_conversations(id),
  lease_until timestamptz,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  sent_by uuid,
  send_channel text check(send_channel in ('whatsapp','phone')),
  provider_id text,
  confirmed_at timestamptz,
  confirmation_channel text check(confirmation_channel in ('whatsapp','phone')),
  confirmed_by uuid,
  response_message_id uuid unique references public.atendhub_inbox_messages(id)
);
create unique index atendhub_eve_current on public.atendhub_eve_reminders(appointment_id) where invalidated_at is null;
create index atendhub_eve_due on public.atendhub_eve_reminders(starts_at) where sent_at is null and invalidated_at is null;
alter table public.atendhub_eve_reminders enable row level security;
revoke all on public.atendhub_eve_reminders from public, anon, authenticated, atendhub_integration;
alter table public.atendhub_leads add column qualified_at timestamptz;

-- Other lead fields retain their existing CRUD permissions.
create function public.atendhub_guard_qualified_at() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated','atendhub_integration') then
    if (tg_op='INSERT' and new.qualified_at is not null) or
       (tg_op='UPDATE' and new.qualified_at is distinct from old.qualified_at) then raise insufficient_privilege; end if;
  end if;
  return new;
end $$;
revoke all on function public.atendhub_guard_qualified_at() from public,anon,authenticated;
create trigger atendhub_guard_qualified_at before insert or update of qualified_at on public.atendhub_leads
  for each row execute function public.atendhub_guard_qualified_at();

create function public.atendhub_eve_schedule() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (old.starts_at<>new.starts_at or new.status in ('cancelled','rescheduling')
    or old.lead_id<>new.lead_id or old.client_id<>new.client_id or old.professional_id<>new.professional_id) then
    update public.atendhub_eve_reminders set invalidated_at=now() where appointment_id=new.id and invalidated_at is null;
  end if;
  if new.status='awaiting_confirmation' and new.starts_at>now() then
    insert into public.atendhub_eve_reminders(appointment_id,starts_at) values(new.id,new.starts_at)
      on conflict (appointment_id) where invalidated_at is null do nothing;
  end if;
  return new;
end $$;
create trigger atendhub_eve_schedule after insert or update of starts_at,status,lead_id,client_id,professional_id
  on public.atendhub_appointments for each row execute function public.atendhub_eve_schedule();
insert into public.atendhub_eve_reminders(appointment_id,starts_at)
  select id,starts_at from public.atendhub_appointments where starts_at>now() and status='awaiting_confirmation';

-- The workflow explicitly enables a client + instance by polling this function for it.
create function public.atendhub_eve_text(p_time timestamptz,p_timezone text,p_code text)
returns text language sql stable set search_path='' as $$
  select 'Podemos confirmar seu agendamento de '||to_char(p_time at time zone p_timezone,'DD/MM às HH24:MI')
    ||'? Responda CONFIRMO '||p_code;
$$;
revoke all on function public.atendhub_eve_text(timestamptz,text,text) from public,anon,authenticated;

create function public.atendhub_eve_claim(p_client uuid,p_instance text) returns jsonb
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
    and (a.starts_at at time zone a.timezone)::date=(now() at time zone a.timezone)::date+1
  order by a.starts_at,r.id,c.id limit 1 for update of a,r skip locked;
  if not found then return null; end if;
  update public.atendhub_eve_reminders set conversation_id=item.conversation,
    lease_until=now()+interval '10 minutes',first_attempt_at=coalesce(first_attempt_at,now()) where id=item.id;
  return jsonb_build_object('requestId',item.id,'phone',item.phone,'instance',p_instance,
    'replyText','CONFIRMO '||item.code,'body',
    public.atendhub_eve_text(item.starts_at,item.timezone,item.code));
end $$;

-- Caller holds appointment, then reminder locks. A confirmation is durable across later cancellations/no-shows.
create function public.atendhub_eve_finish(p_id uuid,p_at timestamptz,p_channel text,p_actor uuid,p_message uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.atendhub_appointments; r public.atendhub_eve_reminders; previous public.atendhub_leads.stage%type;
begin
  select ap.* into strict a from public.atendhub_appointments ap join public.atendhub_eve_reminders e on e.appointment_id=ap.id
    where e.id=p_id for update of ap;
  select * into strict r from public.atendhub_eve_reminders where id=p_id for update;
  if r.confirmed_at is not null then return; end if;
  if r.invalidated_at is not null or a.status not in ('awaiting_confirmation','confirmed')
    or r.sent_at is null or p_at<r.sent_at or p_at>=a.starts_at then raise exception 'STALE_REMINDER'; end if;
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

-- Exact positive reply, from the originating WhatsApp episode, after dispatch and before the appointment.
create function public.atendhub_eve_reconcile(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare msg record;
begin
  perform 1 from public.atendhub_appointments a join public.atendhub_eve_reminders r on r.appointment_id=a.id
    where r.id=p_id for update of a;
  perform 1 from public.atendhub_eve_reminders where id=p_id for update;
  select m.id,m.occurred_at into msg from public.atendhub_eve_reminders r
    join public.atendhub_inbox_messages m on m.conversation_id=r.conversation_id
    join public.atendhub_appointments a on a.id=r.appointment_id
    where r.id=p_id and r.invalidated_at is null and r.confirmed_at is null and r.sent_at is not null
    and a.status in ('awaiting_confirmation','confirmed') and m.direction='inbound' and m.origin='contact'
    and m.message_type='text' and upper(trim(m.body))='CONFIRMO '||r.code and m.occurred_at>=r.sent_at and m.occurred_at<a.starts_at
    order by m.occurred_at,m.id limit 1;
  if found then perform public.atendhub_eve_finish(p_id,msg.occurred_at,'whatsapp',null,msg.id); end if;
end $$;

create function public.atendhub_eve_sent(p_id uuid,p_instance text,p_provider_id text,p_sent_at timestamptz)
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
    or p_sent_at>now()+interval '5 minutes' or (p_sent_at at time zone a.timezone)::date<>(r.starts_at at time zone a.timezone)::date-1
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

create function public.atendhub_eve_on_reply() returns trigger language plpgsql security definer set search_path='' as $$
declare ticket uuid;
begin
  select id into ticket from public.atendhub_eve_reminders where code=substr(upper(trim(new.body)),10)
    and conversation_id=new.conversation_id and invalidated_at is null;
  if found then perform public.atendhub_eve_reconcile(ticket); end if;
  return new;
end $$;
create trigger atendhub_eve_on_reply after insert on public.atendhub_inbox_messages for each row
  when (new.direction='inbound' and upper(trim(new.body)) ~ '^CONFIRMO [A-F0-9]{16}$')
  execute function public.atendhub_eve_on_reply();

create function public.atendhub_eve_phone(p_org uuid,p_id uuid,p_action text) returns void
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
      (now() at time zone a.timezone)::date<>(a.starts_at at time zone a.timezone)::date-1 then raise exception 'STALE_REMINDER'; end if;
    update public.atendhub_eve_reminders set sent_at=now(),send_channel='phone',sent_by=auth.uid() where id=r.id;
  elsif p_action='confirmed' then
    perform public.atendhub_eve_finish(r.id,now(),'phone',auth.uid(),null);
  else raise exception 'INVALID_ACTION'; end if;
end $$;

create function public.atendhub_eve_list(p_org uuid,p_client uuid) returns table(
  id uuid, appointment_id uuid, lead_name text, professional text, starts_at timestamptz, sent_at timestamptz,
  confirmed_at timestamptz, dispatching boolean, can_edit boolean, is_eve boolean)
language sql stable security definer set search_path='' as $$
  select r.id,a.id,l.name::text,p.name::text,a.starts_at,r.sent_at,r.confirmed_at,
    r.first_attempt_at is not null and r.sent_at is null,
    public.atendhub_calendar_allows(p_org,p_client,'edit',a.lead_id,a.created_by_id),
    (a.starts_at at time zone a.timezone)::date=(now() at time zone a.timezone)::date+1
  from public.atendhub_eve_reminders r join public.atendhub_appointments a on a.id=r.appointment_id
  join public.atendhub_leads l on l.id=a.lead_id join public.atendhub_professionals p on p.id=a.professional_id
  where a.organization_id=p_org and a.client_id=p_client and r.invalidated_at is null
    and public.atendhub_is_active_member(p_org)
    and public.atendhub_calendar_allows(p_org,p_client,'view',a.lead_id,a.created_by_id)
    and a.starts_at>now() and (a.starts_at at time zone a.timezone)::date <= (now() at time zone a.timezone)::date+1
  order by a.starts_at,r.id;
$$;

revoke all on function public.atendhub_eve_schedule(),public.atendhub_eve_claim(uuid,text),public.atendhub_eve_finish(uuid,timestamptz,text,uuid,uuid),
  public.atendhub_eve_reconcile(uuid),public.atendhub_eve_sent(uuid,text,text,timestamptz),public.atendhub_eve_on_reply(),
  public.atendhub_eve_phone(uuid,uuid,text),public.atendhub_eve_list(uuid,uuid) from public,anon,authenticated;
grant execute on function public.atendhub_eve_claim(uuid,text),public.atendhub_eve_sent(uuid,text,text,timestamptz) to atendhub_integration;
grant execute on function public.atendhub_eve_phone(uuid,uuid,text),public.atendhub_eve_list(uuid,uuid) to authenticated;
create or replace function public.atendhub_ingest_whatsapp_message(
  p_instance_name text,
  p_provider_message_id text,
  p_remote_jid text,
  p_from_me boolean,
  p_message_type text default 'text',
  p_body text default '',
  p_provider_timestamp timestamptz default null,
  p_correlation_id uuid default null,
  p_remote_phone text default null,
  p_contact_name text default null,
  p_media jsonb default '{}'::jsonb,
  p_provider_meta jsonb default '{}'::jsonb,
  p_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instance text := pg_catalog.btrim(coalesce(p_instance_name, ''));
  v_pmid text := pg_catalog.btrim(coalesce(p_provider_message_id, ''));
  v_jid text := pg_catalog.btrim(coalesce(p_remote_jid, ''));
  v_type text;
  v_body text := coalesce(p_body, '');
  v_media jsonb;
  v_meta jsonb;
  v_ts timestamptz;
  v_kind text;
  v_phone text;
  v_alt text;
  c public.atendhub_whatsapp_connections;
  v_conv public.atendhub_inbox_conversations;
  v_msg public.atendhub_inbox_messages;
  v_unres public.atendhub_inbox_unresolved;
  v_lead_id uuid;
  v_candidates uuid[];
  v_lead_created boolean := false;
  v_reconciled boolean := false;
  v_receipt public.atendhub_inbox_message_receipts;
  v_payload jsonb;
begin
  if p_from_me is null then raise exception 'INVALID_FROM_ME'; end if;
  if v_instance = '' or length(v_instance) > 200 then raise exception 'INVALID_INSTANCE'; end if;
  if v_pmid = '' or length(v_pmid) > 200 then raise exception 'INVALID_PROVIDER_MESSAGE_ID'; end if;
  if v_jid = '' or length(v_jid) > 200 then raise exception 'INVALID_REMOTE_JID'; end if;
  if length(v_body) > 65536 then raise exception 'INVALID_BODY'; end if;
  if jsonb_typeof(coalesce(p_media, '{}'::jsonb)) is distinct from 'object'
     or jsonb_typeof(coalesce(p_provider_meta, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'INVALID_JSON_OBJECT';
  end if;

  v_type := case when coalesce(p_message_type, 'text') in
      ('text','image','audio','video','document','sticker','location','contact','reaction')
    then coalesce(p_message_type, 'text') else 'unknown' end;

  -- Somente metadados mínimos e escalares; URLs e credenciais nunca são persistidas.
  select coalesce(pg_catalog.jsonb_object_agg(k, v), '{}'::jsonb) into v_media
  from pg_catalog.jsonb_each(coalesce(p_media, '{}'::jsonb)) as t(k, v)
  where k in ('mimetype','fileName','fileLength','seconds','caption','width','height','pageCount')
    and jsonb_typeof(v) in ('string', 'number', 'boolean');
  select coalesce(pg_catalog.jsonb_object_agg(k, v), '{}'::jsonb) into v_meta
  from pg_catalog.jsonb_each(coalesce(p_provider_meta, '{}'::jsonb)) as t(k, v)
  where k in ('keyId','remoteJid','remoteJidAlt','participant','senderPn','pushName','source','messageTimestamp','instanceId')
    and jsonb_typeof(v) in ('string', 'number', 'boolean');
  v_meta := v_meta || pg_catalog.jsonb_build_object('remoteJid', v_jid);
  if v_type <> 'text' and v_body = '' then v_body := coalesce(v_media ->> 'caption', ''); end if;

  v_ts := least(coalesce(p_provider_timestamp, pg_catalog.now()), pg_catalog.now() + interval '5 minutes');

  select * into c from public.atendhub_whatsapp_connections
  where instance_name = v_instance and status <> 'deleted';
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'outcome', 'instance_not_found');
  end if;

  v_kind := case
    when v_jid ~ '@g\.us$' then 'group'
    when v_jid ~ '(@broadcast|@newsletter)$' or v_jid ~ '^status@' then 'broadcast'
    when v_jid ~ '@lid$' then 'lid'
    when v_jid ~ '^[1-9][0-9]{6,14}(:[0-9]{1,5})?@(s\.whatsapp\.net|c\.us)$' then 'individual'
    else 'invalid' end;
  if v_kind = 'group' then return pg_catalog.jsonb_build_object('ok', false, 'outcome', 'ignored_group'); end if;
  if v_kind = 'broadcast' then return pg_catalog.jsonb_build_object('ok', false, 'outcome', 'ignored_broadcast'); end if;
  if v_kind = 'invalid' then return pg_catalog.jsonb_build_object('ok', false, 'outcome', 'invalid_jid'); end if;

  v_alt := pg_catalog.regexp_replace(coalesce(p_remote_phone, ''), '\D', '', 'g');
  if v_kind = 'individual' then
    v_phone := (pg_catalog.regexp_match(v_jid, '^([0-9]+)'))[1];
  elsif v_alt ~ '^[1-9][0-9]{6,14}$' then
    v_phone := v_alt;
  end if;

  if v_phone is null then
    insert into public.atendhub_inbox_unresolved
      (organization_id, client_id, connection_id, provider_message_id, reason, remote_jid, remote_phone, from_me, payload)
    values (c.organization_id, c.client_id, c.id, v_pmid, 'pending_identity', v_jid, null, p_from_me,
      pg_catalog.jsonb_build_object('type', v_type, 'body', v_body, 'timestamp', v_ts, 'contactName', p_contact_name,
        'correlationId', p_correlation_id, 'media', v_media, 'meta', v_meta))
    on conflict (connection_id, provider_message_id) do nothing;
    return pg_catalog.jsonb_build_object('ok', false, 'outcome', 'pending_identity');
  end if;
  if v_phone = c.phone then
    return pg_catalog.jsonb_build_object('ok', false, 'outcome', 'ignored_self');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('atendhub_inbox:' || c.client_id::text || ':' || v_phone, 0));

  select * into v_msg from public.atendhub_inbox_messages
  where connection_id = c.id and provider_message_id = v_pmid;
  if found then
    update public.atendhub_inbox_unresolved set resolved_at=now()
      where connection_id=c.id and provider_message_id=v_pmid and resolved_at is null;
    return pg_catalog.jsonb_build_object('ok', true, 'outcome', 'duplicate', 'duplicate', true,
      'leadId', null, 'conversationId', v_msg.conversation_id, 'messageId', v_msg.id);
  end if;

  select * into v_unres from public.atendhub_inbox_unresolved
    where connection_id = c.id and provider_message_id = v_pmid and resolved_at is null
      and reason = 'ambiguous_lead';
  -- Provider echo belongs to the original outbound request, even after closure.
  if p_from_me and p_correlation_id is not null then
    select conv.* into v_conv from public.atendhub_inbox_conversations conv
      join public.atendhub_inbox_messages m on m.conversation_id = conv.id
      where m.id = p_correlation_id and m.origin = 'inbox'
        and conv.connection_id = c.id and conv.phone = v_phone;
  end if;
  -- Associate the provider echo with this invitation even when the patient has two open episodes.
  if v_conv.id is null and p_from_me and v_type='text' and v_body ~ 'CONFIRMO [A-F0-9]{16}$' then
    select conv.* into v_conv from public.atendhub_eve_reminders r
      join public.atendhub_inbox_conversations conv on conv.id=r.conversation_id
      join public.atendhub_appointments ap on ap.id=r.appointment_id
      where r.code=right(v_body,16) and r.first_attempt_at is not null and conv.connection_id=c.id and conv.phone=v_phone
        and v_body=public.atendhub_eve_text(r.starts_at,ap.timezone,r.code);
  end if;
  if not p_from_me and v_type='text' and upper(trim(v_body)) ~ '^CONFIRMO [A-F0-9]{16}$' then
    select conv.* into v_conv from public.atendhub_eve_reminders r
      join public.atendhub_inbox_conversations conv on conv.id=r.conversation_id
      where r.code=substr(upper(trim(v_body)),10) and r.invalidated_at is null and r.first_attempt_at is not null
        and conv.connection_id=c.id and conv.phone=v_phone and r.starts_at>v_ts;
  end if;
  if v_conv.id is null and v_unres.id is not null and p_lead_id is null then
    return pg_catalog.jsonb_build_object('ok',false,'outcome','ambiguous_lead',
      'candidateLeadIds',v_unres.candidate_lead_ids);
  end if;

  if v_conv.id is null then
    if p_lead_id is not null then
      if v_unres.id is null or not (p_lead_id = any(v_unres.candidate_lead_ids)) then
        raise exception 'LEAD_OVERRIDE_NOT_ALLOWED';
      end if;
      v_lead_id := p_lead_id;
    else
      select array_agg(id order by id) into v_candidates from (
        select lead_id as id from public.atendhub_inbox_conversations
          where connection_id = c.id and remote_jid = v_phone || '@s.whatsapp.net' and status = 'open'
        union
        select l.id from public.atendhub_leads l
          where l.organization_id = c.organization_id and l.client_id = c.client_id
          and (regexp_replace(l.phone,'\D','','g') = v_phone or
            (length(regexp_replace(l.phone,'\D','','g')) in (10,11)
            and '55'||regexp_replace(l.phone,'\D','','g') = v_phone))
          and not exists (select 1 from public.atendhub_inbox_conversations h
            where h.connection_id=c.id and h.remote_jid=v_phone || '@s.whatsapp.net' and h.lead_id=l.id)
      ) candidates;
      if v_candidates is null then
        select array_agg(lead_id order by lead_id) into v_candidates from public.atendhub_inbox_conversations
          where connection_id=c.id and remote_jid=v_phone || '@s.whatsapp.net';
      end if;
      if cardinality(v_candidates) > 1 or exists (
        select 1 from public.atendhub_inbox_conversations where connection_id = c.id
          and remote_jid = v_phone || '@s.whatsapp.net' and lead_id = v_candidates[1]
          and status = 'closed'
      ) then
        insert into public.atendhub_inbox_unresolved
          (organization_id, client_id, connection_id, provider_message_id, reason, remote_jid, remote_phone, from_me, candidate_lead_ids, payload)
        values (c.organization_id, c.client_id, c.id, v_pmid, 'ambiguous_lead', v_jid, v_phone, p_from_me, v_candidates,
          pg_catalog.jsonb_build_object('type', v_type, 'body', v_body, 'timestamp', v_ts, 'contactName', p_contact_name,
            'correlationId', p_correlation_id, 'media', v_media, 'meta', v_meta))
        on conflict (connection_id, provider_message_id) do update set
          reason=excluded.reason, remote_phone=excluded.remote_phone, payload=excluded.payload,
          candidate_lead_ids=excluded.candidate_lead_ids
          where atendhub_inbox_unresolved.reason='pending_identity' and atendhub_inbox_unresolved.resolved_at is null;
        return pg_catalog.jsonb_build_object('ok', false, 'outcome', 'ambiguous_lead', 'candidateLeadIds', v_candidates);
      elsif coalesce(pg_catalog.array_length(v_candidates, 1), 0) = 1 then
        v_lead_id := v_candidates[1];
      end if;
    end if;

    if v_lead_id is null then
      insert into public.atendhub_leads
        (organization_id, client_id, name, phone, source, capture_status, stage, notes)
      values (c.organization_id, c.client_id,
        coalesce(nullif(pg_catalog.btrim(p_contact_name), ''), '+' || v_phone), v_phone,
        'whatsapp', 'incomplete', 'new', '')
      returning id into v_lead_id;
      v_lead_created := true;
      insert into public.atendhub_lead_events (organization_id, lead_id, actor_id, event_type, to_stage, metadata)
      values (c.organization_id, v_lead_id, null, 'created', 'new',
        pg_catalog.jsonb_build_object('source', 'whatsapp', 'connectionId', c.id, 'instanceName', c.instance_name,
          'providerMessageId', v_pmid));
    end if;

    insert into public.atendhub_inbox_conversations
      (organization_id, client_id, connection_id, lead_id, remote_jid, phone)
    values (c.organization_id, c.client_id, c.id, v_lead_id, v_phone || '@s.whatsapp.net', v_phone)
    on conflict (connection_id, remote_jid, lead_id) do nothing;
    select * into v_conv from public.atendhub_inbox_conversations
    where connection_id = c.id and remote_jid = v_phone || '@s.whatsapp.net' and lead_id = v_lead_id;
  end if;

  -- Eco de mensagem enviada pelo Inbox: reconcilia pelo ID interno devolvido ao workflow.
  if p_from_me and p_correlation_id is not null then
    update public.atendhub_inbox_messages
    set provider_message_id = v_pmid,
        status = public.atendhub_inbox_next_status(status, 'sent'),
        status_updated_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_correlation_id and connection_id = c.id and conversation_id = v_conv.id
      and origin = 'inbox' and provider_message_id is null
    returning * into v_msg;
    v_reconciled := found;
  end if;

  if not v_reconciled then
    insert into public.atendhub_inbox_messages
      (organization_id, client_id, connection_id, conversation_id, provider_message_id, direction, origin,
       message_type, body, media, provider_meta, occurred_at, status)
    values (c.organization_id, c.client_id, c.id, v_conv.id, v_pmid,
      case when p_from_me then 'outbound' else 'inbound' end,
      case when p_from_me then 'external_device' else 'contact' end,
      v_type, v_body, v_media, v_meta, v_ts,
      case when p_from_me then 'sent' else 'received' end)
    on conflict (connection_id, provider_message_id) where provider_message_id is not null do nothing
    returning * into v_msg;
    if not found then
      select * into v_msg from public.atendhub_inbox_messages
      where connection_id = c.id and provider_message_id = v_pmid;
      return pg_catalog.jsonb_build_object('ok', true, 'outcome', 'duplicate', 'duplicate', true,
        'leadId', v_conv.lead_id, 'conversationId', v_conv.id, 'messageId', v_msg.id);
    end if;
  end if;

  if v_msg.direction = 'outbound' then
    select * into v_receipt from public.atendhub_inbox_message_receipts
    where connection_id = c.id and provider_message_id = v_pmid;
    if found then
      update public.atendhub_inbox_messages
      set status = public.atendhub_inbox_next_status(status, v_receipt.status),
          failure_reason = case when v_receipt.status = 'failed' then v_receipt.reason else failure_reason end,
          status_updated_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_msg.id returning * into v_msg;
    end if;
  end if;

  update public.atendhub_inbox_conversations
  set last_inbound_at = case when v_msg.direction = 'inbound' then greatest(coalesce(last_inbound_at, v_msg.occurred_at), v_msg.occurred_at) else last_inbound_at end,
      last_outbound_at = case when v_msg.direction = 'outbound' then greatest(coalesce(last_outbound_at, v_msg.occurred_at), v_msg.occurred_at) else last_outbound_at end,
      unread_count = unread_count + case when v_msg.direction = 'inbound' and not v_reconciled then 1 else 0 end,
      status = case when v_msg.direction = 'inbound' then 'open' else status end,
      last_message_id = case when last_message_at is null or v_msg.occurred_at >= last_message_at then v_msg.id else last_message_id end,
      last_message_preview = case when last_message_at is null or v_msg.occurred_at >= last_message_at
        then public.atendhub_inbox_preview(v_msg.message_type, v_msg.body) else last_message_preview end,
      last_message_at = case when last_message_at is null or v_msg.occurred_at >= last_message_at then v_msg.occurred_at else last_message_at end,
      updated_at = pg_catalog.now()
  where id = v_conv.id;

  update public.atendhub_inbox_unresolved set resolved_at = pg_catalog.now()
  where connection_id = c.id and provider_message_id = v_pmid and resolved_at is null;

  return pg_catalog.jsonb_build_object('ok', true,
    'outcome', case when v_reconciled then 'reconciled' else 'recorded' end,
    'duplicate', false, 'leadCreated', v_lead_created,
    'leadId', v_conv.lead_id, 'conversationId', v_conv.id, 'messageId', v_msg.id,
    'organizationId', c.organization_id, 'clientId', c.client_id, 'connectionId', c.id);
end;
$$;

commit;
