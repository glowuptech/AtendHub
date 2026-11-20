begin;
-- The channel is (connection_id, remote_jid); each conversation row is one lead's episode.
-- Existing IDs, dependent messages, receipts, assistant threads and their ACLs are preserved.
alter table public.atendhub_inbox_conversations
  drop constraint atendhub_inbox_conversations_connection_jid_key,
  add unique (connection_id, remote_jid, lead_id);
create or replace function public.atendhub_inbox_start_conversation(p_lead_id uuid,p_connection_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare l public.atendhub_leads; c public.atendhub_whatsapp_connections; v_phone text; locked_phone text; existing public.atendhub_inbox_conversations; result_id uuid;
begin
 if auth.uid() is null then raise insufficient_privilege using message='INBOX_START_FORBIDDEN'; end if;
 select * into l from public.atendhub_leads where id=p_lead_id;
 if not found or l.owner_id is distinct from auth.uid() or not public.atendhub_is_active_member(l.organization_id) or not public.atendhub_has_client_access(l.organization_id,l.client_id) then raise insufficient_privilege using message='INBOX_START_FORBIDDEN'; end if;
 select * into c from public.atendhub_whatsapp_connections where id=p_connection_id and organization_id=l.organization_id and client_id=l.client_id and status not in ('deleted','delete_pending');
 if not found then raise exception 'CONNECTION_NOT_FOUND'; end if;
 v_phone:=pg_catalog.regexp_replace(coalesce(l.phone,''),'\D','','g');
 if length(v_phone) in (10,11) then v_phone:='55'||v_phone; end if;
 if v_phone !~ '^[1-9][0-9]{6,14}$' then raise exception 'INVALID_PHONE'; end if;
 if v_phone=c.phone then raise exception 'SELF_PHONE'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atendhub_inbox:'||c.client_id::text||':'||v_phone,0));
 select * into l from public.atendhub_leads where id=p_lead_id for update;
 if not found or l.owner_id is distinct from auth.uid() or l.organization_id<>c.organization_id or l.client_id<>c.client_id or not public.atendhub_is_active_member(l.organization_id) or not public.atendhub_has_client_access(l.organization_id,l.client_id) then raise insufficient_privilege using message='INBOX_START_FORBIDDEN'; end if;
 locked_phone:=pg_catalog.regexp_replace(coalesce(l.phone,''),'\D','','g');
 if length(locked_phone) in (10,11) then locked_phone:='55'||locked_phone; end if;
 if locked_phone<>v_phone then raise exception 'LEAD_CHANGED_RETRY'; end if;
 select * into existing from public.atendhub_inbox_conversations where connection_id=c.id and remote_jid=v_phone||'@s.whatsapp.net' and lead_id=l.id;
 if found then
  return existing.id;
 end if;
 insert into public.atendhub_inbox_conversations(organization_id,client_id,connection_id,lead_id,remote_jid,phone)
 values(l.organization_id,l.client_id,c.id,l.id,v_phone||'@s.whatsapp.net',v_phone) returning id into result_id;
 return result_id;
end $$;
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

-- ---------------------------------------------------------------- recibos (entrega/leitura/falha)
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

  if v_conv.status = 'closed' then raise exception 'ATENDIMENTO_ENCERRADO'; end if;

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


create table public.atendhub_inbox_episode_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.atendhub_inbox_conversations(id) on delete cascade,
  status text not null check (status in ('open','closed')),
  actor_id uuid,
  occurred_at timestamptz not null default now()
);
alter table public.atendhub_inbox_episode_events enable row level security;
revoke all on public.atendhub_inbox_episode_events from public, anon, authenticated;
grant select on public.atendhub_inbox_episode_events to authenticated;
create policy atendhub_episode_history on public.atendhub_inbox_episode_events for select to authenticated
  using (public.atendhub_inbox_can_access_conversation(conversation_id));
create function public.atendhub_log_episode_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.atendhub_inbox_episode_events(conversation_id,status,actor_id)
      values (new.id,new.status,auth.uid());
  end if;
  return new;
end $$;
revoke all on function public.atendhub_log_episode_status() from public,anon,authenticated;
create trigger atendhub_episode_status after insert or update of status on public.atendhub_inbox_conversations
  for each row execute function public.atendhub_log_episode_status();

create function public.atendhub_inbox_change_episode(p_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  c public.atendhub_inbox_conversations;
  l public.atendhub_leads;
begin
  select * into strict c from public.atendhub_inbox_conversations where id=p_id;
  perform pg_advisory_xact_lock(hashtextextended('atendhub_inbox:'||c.client_id::text||':'||c.phone,0));
  select * into strict c from public.atendhub_inbox_conversations where id=p_id for update;
  select * into strict l from public.atendhub_leads where id=c.lead_id for update;
  if auth.uid() is null or l.owner_id is distinct from auth.uid()
     or not public.atendhub_inbox_can_access(c.organization_id,c.client_id,l.id) then
    raise insufficient_privilege;
  end if;
  if p_action in ('close','resume') then
    update public.atendhub_inbox_conversations set
      status=case when p_action='close' then 'closed' else 'open' end,updated_at=now() where id=c.id;
    return c.id;
  end if;
  raise exception 'INVALID_ACTION';
end $$;

create function public.atendhub_inbox_new_episode(p_id uuid,p_request uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  c public.atendhub_inbox_conversations;
  l public.atendhub_leads;
  new_lead uuid;
begin
  select * into strict c from public.atendhub_inbox_conversations where id=p_id;
  select * into strict l from public.atendhub_leads where id=c.lead_id;
  if auth.uid() is null or l.owner_id is distinct from auth.uid() then raise insufficient_privilege; end if;
  if p_request is null then raise exception 'INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended('atendhub_inbox:'||c.client_id::text||':'||c.phone,0));
  -- Existing lead creation/claim functions enforce the same permissions as CRM/queue.
  select public.atendhub_create_manual_lead(
    p_organization_id=>c.organization_id,p_client_id=>c.client_id,p_professional_id=>null,
    p_name=>l.name,p_phone=>c.phone,p_email=>'',p_source=>'manual',p_capture_status=>'incomplete',
    p_next_action=>'',p_notes=>'',p_form_id=>null,p_form_version_id=>null,
    p_original_captured_at=>now(),p_field_values=>'[]'::jsonb,
    p_idempotency_key=>'episode:'||c.id::text||':'||p_request::text,p_actor_id=>auth.uid()
  ) into new_lead;
  if exists(select 1 from public.atendhub_leads where id=new_lead and owner_id is null) then
    perform public.atendhub_claim_lead(_organization_id=>c.organization_id,_lead_id=>new_lead);
  end if;
  return public.atendhub_inbox_start_conversation(new_lead,c.connection_id);
end $$;

-- A reviewer must be allowed to see every original candidate before seeing an
-- unassigned message. Do not expose quarantined payloads through table grants.
create index atendhub_inbox_review_pending_idx on public.atendhub_inbox_unresolved(organization_id,created_at,id)
  where reason='ambiguous_lead' and resolved_at is null;

create function public.atendhub_inbox_review_items(p_org uuid)
returns table(id uuid, preview text, occurred_at timestamptz, candidates jsonb)
language sql stable security definer set search_path='' as $$
  select u.id,left(u.payload->>'body',180),u.created_at,
    (select jsonb_agg(jsonb_build_object('id',l.id,'label',l.name,'createdAt',l.created_at,
      'client',cl.name,'stage',l.stage) order by l.created_at,l.id)
     from public.atendhub_leads l join public.atendhub_clients cl on cl.id=l.client_id
     where l.organization_id=u.organization_id and l.client_id=u.client_id
       and public.atendhub_inbox_can_access(l.organization_id,l.client_id,l.id)
       and (l.id=any(u.candidate_lead_ids) or exists (
         select 1 from public.atendhub_inbox_conversations c where c.connection_id=u.connection_id
           and c.phone=u.remote_phone and c.lead_id=l.id)))
  from public.atendhub_inbox_unresolved u
  where u.organization_id=p_org and u.reason='ambiguous_lead' and u.resolved_at is null
    and cardinality(u.candidate_lead_ids)>0
    and not exists(select 1 from unnest(u.candidate_lead_ids) x
      where not public.atendhub_inbox_can_access(u.organization_id,u.client_id,x))
  order by u.created_at,u.id limit 100;
$$;

create function public.atendhub_inbox_route_review(p_org uuid,p_item uuid,p_lead uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  u public.atendhub_inbox_unresolved;
  instance text;
  result jsonb;
begin
  select * into strict u from public.atendhub_inbox_unresolved where id=p_item and organization_id=p_org;
  perform pg_advisory_xact_lock(hashtextextended('atendhub_inbox:'||u.client_id::text||':'||u.remote_phone,0));
  if not exists(select 1 from public.atendhub_inbox_review_items(p_org) r,
    jsonb_array_elements(r.candidates) option where r.id=p_item and option->>'id'=p_lead::text) then
    raise insufficient_privilege;
  end if;
  update public.atendhub_inbox_unresolved set candidate_lead_ids=array_append(candidate_lead_ids,p_lead)
    where id=u.id and not p_lead=any(candidate_lead_ids);
  select instance_name into strict instance from public.atendhub_whatsapp_connections where id=u.connection_id;
  result:=public.atendhub_ingest_whatsapp_message(instance,u.provider_message_id,u.remote_jid,u.from_me,
    u.payload->>'type',u.payload->>'body',(u.payload->>'timestamp')::timestamptz,
    (u.payload->>'correlationId')::uuid,u.remote_phone,u.payload->>'contactName',
    u.payload->'media',u.payload->'meta',p_lead);
  if result->>'ok' is distinct from 'true' then raise exception 'ROUTING_FAILED'; end if;
  return (result->>'conversationId')::uuid;
end $$;

revoke all on function public.atendhub_inbox_new_episode(uuid,uuid), public.atendhub_inbox_change_episode(uuid,text),
 public.atendhub_inbox_review_items(uuid), public.atendhub_inbox_route_review(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.atendhub_inbox_new_episode(uuid,uuid), public.atendhub_inbox_change_episode(uuid,text),
 public.atendhub_inbox_review_items(uuid), public.atendhub_inbox_route_review(uuid,uuid,uuid) to authenticated;
commit;
