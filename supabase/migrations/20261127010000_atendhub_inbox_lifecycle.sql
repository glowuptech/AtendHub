begin;

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
  if v_conv.id is null and p_from_me and v_type='text' and v_body ~ '(CONFIRMO |Ref\. )[A-F0-9]{16}$' then
    select conv.* into v_conv from public.atendhub_eve_reminders r
      join public.atendhub_inbox_conversations conv on conv.id=r.conversation_id
      join public.atendhub_appointments ap on ap.id=r.appointment_id
      where r.code=right(v_body,16) and r.first_attempt_at is not null and conv.connection_id=c.id and conv.phone=v_phone
        and v_body=public.atendhub_reminder_text(r.starts_at,ap.timezone,r.code,r.notification_only);
  end if;
  if v_conv.id is null and p_from_me and v_type='text'
      and v_body ~ '/confirmar/[A-Za-z0-9_-]{22,36}$' then
    select conv.* into v_conv from public.atendhub_eve_reminders r
      join public.atendhub_inbox_conversations conv on conv.id=r.conversation_id
      where r.public_token=public.atendhub_confirmation_token_uuid(substring(v_body from '/confirmar/([A-Za-z0-9_-]+)$'))
        and r.outbound_body=v_body
        and conv.connection_id=c.id and conv.phone=v_phone;
  end if;
  if not p_from_me and v_type='text' and upper(trim(v_body)) ~ '^CONFIRMO [A-F0-9]{16}$' then
    select conv.* into v_conv from public.atendhub_eve_reminders r
      join public.atendhub_inbox_conversations conv on conv.id=r.conversation_id
      where r.code=substr(upper(trim(v_body)),10) and not r.notification_only and r.invalidated_at is null and r.first_attempt_at is not null
        and conv.connection_id=c.id and conv.phone=v_phone and r.starts_at>v_ts;
  end if;
  if v_conv.id is null and p_from_me and p_lead_id is null then
    select conv.* into v_conv from public.atendhub_inbox_conversations conv
      where conv.connection_id=c.id and conv.phone=v_phone
        and not exists (
          select 1 from public.atendhub_inbox_conversations other
            where other.connection_id=conv.connection_id and other.remote_jid=conv.remote_jid and other.id<>conv.id
              and (other.status='open' or conv.status='closed')
        );
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
      if cardinality(v_candidates) > 1 then
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

create or replace function public.atendhub_inbox_request_send(
  p_conversation_id uuid,
  p_request_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_conv public.atendhub_inbox_conversations;
  v_conn public.atendhub_whatsapp_connections;
  v_msg public.atendhub_inbox_messages;
  v_event_id uuid := gen_random_uuid();
  v_existing public.atendhub_inbox_send_events;
  v_client public.atendhub_clients;
  v_op public.atendhub_operations;
  v_lead public.atendhub_leads;
  v_member public.atendhub_team_members;
begin
  if v_user is null then raise exception using errcode = '42501', message = 'INBOX_NOT_AUTHENTICATED'; end if;
  if p_request_id is null then raise exception 'INVALID_REQUEST_ID'; end if;
  if length(v_body) not between 1 and 6000 then raise exception 'INVALID_BODY'; end if;

  select * into v_conv from public.atendhub_inbox_conversations where id = p_conversation_id for update;
  if not found then raise exception using errcode = '42501', message = 'INBOX_SEND_FORBIDDEN'; end if;
  select * into v_lead from public.atendhub_leads
  where id = v_conv.lead_id and organization_id = v_conv.organization_id for update;
  if not found
     or not public.atendhub_is_active_member(v_conv.organization_id)
     or not public.atendhub_has_client_access(v_conv.organization_id, v_conv.client_id)
     or v_lead.owner_id is distinct from v_user then
    raise exception using errcode = '42501', message = 'INBOX_SEND_FORBIDDEN';
  end if;

  -- Accepted delivery reopens the conversation; a pending request may still fail.

  select * into v_msg from public.atendhub_inbox_messages
  where organization_id = v_conv.organization_id and request_id = p_request_id;
  if found then
    if v_msg.conversation_id <> v_conv.id or v_msg.author_id is distinct from v_user or v_msg.body <> v_body then
      raise exception using errcode = 'P0001', message = 'REQUEST_ID_CONFLICT';
    end if;
    select * into v_existing from public.atendhub_inbox_send_events where message_id = v_msg.id;
    if v_msg.status = 'failed' and v_msg.provider_message_id is null then
      update public.atendhub_inbox_messages
      set status = 'pending', failure_reason = null, status_updated_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_msg.id returning * into v_msg;
    end if;
    return pg_catalog.jsonb_build_object('messageId', v_msg.id, 'eventId', v_existing.id,
      'status', v_msg.status, 'conversationId', v_conv.id, 'existing', true);
  end if;

  select * into v_conn from public.atendhub_whatsapp_connections
  where id = v_conv.connection_id and organization_id = v_conv.organization_id;
  if not found or v_conn.status <> 'connected' then
    raise exception using errcode = 'P0001', message = 'CONNECTION_NOT_READY';
  end if;

  select * into v_client from public.atendhub_clients where id = v_conv.client_id;
  select * into v_op from public.atendhub_operations where id = v_client.operation_id;
  select * into v_member from public.atendhub_team_members where id = v_user;

  insert into public.atendhub_inbox_messages
    (organization_id, client_id, connection_id, conversation_id, direction, origin, message_type,
     body, occurred_at, author_id, status, request_id)
  values (v_conv.organization_id, v_conv.client_id, v_conv.connection_id, v_conv.id, 'outbound', 'inbox', 'text',
     v_body, pg_catalog.now(), v_user, 'pending', p_request_id)
  returning * into v_msg;

  insert into public.atendhub_inbox_send_events (id, organization_id, message_id, payload)
  values (v_event_id, v_conv.organization_id, v_msg.id, pg_catalog.jsonb_build_object(
    'eventId', v_event_id,
    'eventType', 'inbox.message.send_requested',
    'contractVersion', 1,
    'occurredAt', pg_catalog.now(),
    'organization', pg_catalog.jsonb_build_object('id', v_conv.organization_id),
    'client', pg_catalog.jsonb_build_object('id', v_client.id, 'name', v_client.name),
    'operation', pg_catalog.jsonb_build_object('id', v_op.id, 'code', v_op.code, 'name', v_op.name),
    'lead', pg_catalog.jsonb_build_object('id', v_lead.id, 'name', v_lead.name),
    'conversation', pg_catalog.jsonb_build_object('id', v_conv.id, 'remoteJid', v_conv.remote_jid),
    'message', pg_catalog.jsonb_build_object('id', v_msg.id, 'requestId', p_request_id, 'type', 'text', 'body', v_body),
    'user', pg_catalog.jsonb_build_object('id', v_user, 'name', v_member.display_name),
    'recipient', pg_catalog.jsonb_build_object('phone', v_conv.phone, 'remoteJid', v_conv.remote_jid),
    'connection', pg_catalog.jsonb_build_object('id', v_conn.id, 'instanceName', v_conn.instance_name, 'phone', v_conn.phone)));

  update public.atendhub_inbox_conversations
  set last_outbound_at = v_msg.occurred_at,
      last_message_id = v_msg.id, last_message_at = greatest(coalesce(last_message_at, v_msg.occurred_at), v_msg.occurred_at),
      last_message_preview = pg_catalog.left(v_body, 200), updated_at = pg_catalog.now()
  where id = v_conv.id;

  return pg_catalog.jsonb_build_object('messageId', v_msg.id, 'eventId', v_event_id,
    'status', 'pending', 'conversationId', v_conv.id, 'existing', false);
end;
$$;

-- Track arrival in the current column independently of the queue SLA.
alter table public.atendhub_leads add column stage_entered_at timestamptz;
update public.atendhub_leads l set stage_entered_at = coalesce((
  select max(e.created_at) from public.atendhub_lead_events e
  where e.lead_id=l.id and e.to_stage=l.stage
),l.queue_entered_at,l.created_at);
alter table public.atendhub_leads alter column stage_entered_at set default now();
create function public.atendhub_stamp_stage_entry() returns trigger
language plpgsql set search_path='' as $$
begin
  new.stage_entered_at=now();
  return new;
end $$;
create trigger atendhub_stamp_stage_entry before update of stage on public.atendhub_leads
for each row when (old.stage is distinct from new.stage) execute function public.atendhub_stamp_stage_entry();

create index if not exists atendhub_episode_last_transition
on public.atendhub_inbox_episode_events(conversation_id,status,occurred_at desc);

create function public.atendhub_close_lead_stage() returns trigger
language plpgsql security definer set search_path='' as $$
declare booking text;
begin
  if exists (select 1 from public.atendhub_inbox_conversations c
    where c.lead_id=new.lead_id and c.id<>new.id and c.status='open') then return new; end if;

  select a.status into booking from public.atendhub_appointments a
  where a.lead_id=new.lead_id and a.client_id=new.client_id and a.organization_id=new.organization_id
    and a.starts_at >= now() and a.status in ('confirmed','awaiting_confirmation','rescheduling')
  order by a.starts_at, a.id limit 1;

  update public.atendhub_leads set stage=case booking
    when 'confirmed' then 'confirmed' when 'awaiting_confirmation' then 'scheduled'
    when 'rescheduling' then 'rescheduling' else 'recovery' end, updated_at=now()
  where id=new.lead_id and client_id=new.client_id and organization_id=new.organization_id
    and stage in ('new','in_progress','waiting','awaiting_scheduling');
  return new;
end $$;
create trigger atendhub_close_lead_stage after update of status on public.atendhub_inbox_conversations
for each row when (old.status='open' and new.status='closed') execute function public.atendhub_close_lead_stage();

-- Reconcile previously closed episodes only when the lead has not been worked since.
update public.atendhub_leads l set stage='recovery',updated_at=now()
where l.stage in ('new','in_progress','waiting','awaiting_scheduling')
  and exists (select 1 from public.atendhub_inbox_conversations c
    join public.atendhub_inbox_episode_events e on e.conversation_id=c.id and e.status='closed'
    where c.lead_id=l.id and c.status='closed' and e.occurred_at>=l.updated_at)
  and not exists (select 1 from public.atendhub_inbox_conversations c where c.lead_id=l.id and c.status='open')
  and not exists (select 1 from public.atendhub_appointments a where a.lead_id=l.id
    and a.starts_at>=now() and a.status in ('confirmed','awaiting_confirmation','rescheduling'));

create function public.atendhub_reopen_on_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.atendhub_inbox_conversations;
begin
  if tg_op='UPDATE' and old.status in ('received','sent','delivered','read') then return new; end if;
  select * into c from public.atendhub_inbox_conversations where id=new.conversation_id for update;
  if c.status <> 'closed' then return new; end if;
  -- The appointment reminder is logged in the history even if the chat is closed.
  if new.direction='outbound' and new.origin='external_device' and exists (
    select 1 from public.atendhub_eve_reminders r
    join public.atendhub_appointments a on a.id=r.appointment_id
    where r.conversation_id=c.id and (r.provider_id=new.provider_message_id or
      (r.first_attempt_at is not null and r.sent_at is null and
       new.body=coalesce(r.outbound_body,public.atendhub_reminder_text(r.starts_at,a.timezone,r.code,r.notification_only))))
  ) then return new; end if;
  if new.occurred_at < date_trunc('second',coalesce((
    select max(e.occurred_at) from public.atendhub_inbox_episode_events e
    where e.conversation_id=c.id and e.status='closed'),c.updated_at)) then return new; end if;
  update public.atendhub_inbox_conversations set status='open',updated_at=now() where id=c.id;
  update public.atendhub_leads set stage='new', owner_id=null,assigned_at=null,claimed_at=null,
    first_response_at=null,queue_entered_at=now(),stage_entered_at=now(),updated_at=now()
  where id=c.lead_id and organization_id=c.organization_id and client_id=c.client_id;
  return new;
end $$;
create trigger atendhub_reopen_on_message after insert or update of status on public.atendhub_inbox_messages
for each row when (new.status in ('received','sent','delivered','read')) execute function public.atendhub_reopen_on_message();

create function public.atendhub_close_idle_conversations() returns integer
language plpgsql set search_path='' as $$
declare closed_count integer;
begin
  with idle as (
    select c.id from public.atendhub_inbox_conversations c where c.status='open'
      and coalesce(c.last_message_at,c.created_at) <= now()-interval '48 hours'
      and not exists (select 1 from public.atendhub_inbox_episode_events e
        where e.conversation_id=c.id and e.status='open' and e.occurred_at > now()-interval '48 hours')
    order by coalesce(c.last_message_at,c.created_at), c.id limit 1000 for update skip locked
  )
  update public.atendhub_inbox_conversations c set status='closed',updated_at=now()
  from idle where c.id=idle.id;
  get diagnostics closed_count = row_count;
  return closed_count;
end $$;
revoke all on function public.atendhub_close_idle_conversations(),public.atendhub_close_lead_stage(),public.atendhub_reopen_on_message() from public,anon,authenticated;
create or replace function public.atendhub_inbox_apply_send_result(
  p_event_id uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.atendhub_inbox_send_events;
  m public.atendhub_inbox_messages;
  x public.atendhub_inbox_messages;
  v_pmid text := nullif(pg_catalog.btrim(coalesce(p_provider_message_id, '')), '');
  v_next text;
  v_receipt public.atendhub_inbox_message_receipts;
  v_lead public.atendhub_leads;
begin
  if p_outcome is null or p_outcome not in ('sent', 'failed', 'uncertain') then raise exception 'INVALID_OUTCOME'; end if;
  if p_outcome = 'sent' and v_pmid is null then raise exception 'PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  if v_pmid is not null and length(v_pmid) > 200 then raise exception 'INVALID_PROVIDER_MESSAGE_ID'; end if;

  select * into ev from public.atendhub_inbox_send_events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  select * into m from public.atendhub_inbox_messages where id = ev.message_id for update;

  -- Eco da Evolution que chegou antes do resultado: funde a linha criada pelo eco
  -- (mesmo ID de provedor, mesma conexão e conversa) nesta mensagem do Inbox.
  if v_pmid is not null and m.provider_message_id is null then
    select * into x from public.atendhub_inbox_messages
    where connection_id = m.connection_id and provider_message_id = v_pmid and id <> m.id;
    if found then
      if x.origin = 'external_device' and x.conversation_id = m.conversation_id then
        delete from public.atendhub_inbox_messages where id = x.id;
        perform public.atendhub_inbox_refresh_conversation(m.conversation_id);
      else
        raise exception using errcode = 'P0001', message = 'PROVIDER_MESSAGE_ID_CONFLICT';
      end if;
    end if;
  end if;

  v_next := public.atendhub_inbox_next_status(m.status, p_outcome);
  if v_pmid is not null and m.provider_message_id is null then
    select * into v_receipt from public.atendhub_inbox_message_receipts
    where connection_id = m.connection_id and provider_message_id = v_pmid;
    if found then v_next := public.atendhub_inbox_next_status(v_next, v_receipt.status); end if;
  end if;

  update public.atendhub_inbox_messages
  set status = v_next,
      provider_message_id = coalesce(provider_message_id, v_pmid),
      failure_reason = case when v_next in ('failed', 'uncertain') then pg_catalog.left(p_reason, 500) else null end,
      status_updated_at = case when v_next <> m.status then pg_catalog.now() else status_updated_at end,
      updated_at = pg_catalog.now()
  where id = m.id returning * into m;

  update public.atendhub_inbox_send_events
  set attempts = attempts + 1, last_attempt_at = pg_catalog.now(), last_outcome = p_outcome,
      delivery_status = case when p_outcome = 'uncertain' then 'retry' when p_outcome = 'failed' then 'retry' else 'delivered' end
  where id = ev.id;

  if p_outcome = 'sent' then
    select * into v_lead from public.atendhub_leads l
    where l.id = (select lead_id from public.atendhub_inbox_conversations where id = m.conversation_id) for update;
    if found and v_lead.first_response_at is null and m.author_id is not null and v_lead.owner_id=m.author_id then
      update public.atendhub_leads set first_response_at = pg_catalog.now(), updated_at = pg_catalog.now() where id = v_lead.id;
      insert into public.atendhub_lead_events (organization_id, lead_id, actor_id, event_type, metadata)
      values (v_lead.organization_id, v_lead.id, m.author_id, 'first_response',
        pg_catalog.jsonb_build_object('channel', 'whatsapp', 'messageId', m.id));
    end if;
  end if;
  perform public.atendhub_inbox_refresh_conversation(m.conversation_id);

  return pg_catalog.jsonb_build_object('ok', true, 'messageId', m.id, 'status', m.status,
    'providerMessageId', m.provider_message_id);
end;
$$;
create or replace function public.atendhub_eve_claim(p_client uuid,p_instance text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item record;
begin
  select r.id,r.code,a.starts_at,a.timezone,(r.notification_only or (r.slot=2 and r.first_attempt_at is null)) as notice,r.outbound_body,c.id as conversation,c.phone into item
  from public.atendhub_eve_reminders r join public.atendhub_appointments a on a.id=r.appointment_id
  join public.atendhub_inbox_conversations c on c.lead_id=a.lead_id and c.client_id=a.client_id
    and c.organization_id=a.organization_id
  join public.atendhub_whatsapp_connections w on w.id=c.connection_id
  where a.client_id=p_client and w.instance_name=p_instance and w.status='connected'
    and (a.status='awaiting_confirmation' or (a.status='confirmed' and r.slot=2 and (r.notification_only or r.first_attempt_at is null))) and r.invalidated_at is null and r.sent_at is null
    and (r.conversation_id=c.id or (r.conversation_id is null and not exists (
      select 1 from public.atendhub_inbox_conversations other where other.lead_id=a.lead_id
        and other.connection_id=c.connection_id and other.id<>c.id)))
    and (r.lease_until is null or r.lease_until<=now())
    and a.starts_at>now() and public.atendhub_reminder_due(r.id)<=now()
  order by a.starts_at,r.slot,r.id,c.id limit 1 for update of a,r skip locked;
  if not found then return null; end if;
  update public.atendhub_eve_reminders set conversation_id=item.conversation,notification_only=item.notice,
    lease_until=now()+interval '10 minutes',first_attempt_at=coalesce(first_attempt_at,now()) where id=item.id;
  return jsonb_build_object('requestId',item.id,'phone',item.phone,'instance',p_instance,
    'purpose',case when item.notice then 'reminder' else 'confirmation' end,
    'replyText',case when not item.notice and item.outbound_body is null then 'CONFIRMO '||item.code end,
    'confirmationUrl',substring(item.outbound_body from 'https://[^[:space:]]+$'),'body',
    coalesce(item.outbound_body,public.atendhub_reminder_text(item.starts_at,item.timezone,item.code,item.notice)));
end $$;
commit;
