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
  v_requeue boolean;
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

  v_requeue := not p_from_me and v_conv.status = 'closed' and v_unres.id is null
    and v_ts >= date_trunc('second', coalesce((
      select max(e.occurred_at) from public.atendhub_inbox_episode_events e
      where e.conversation_id=v_conv.id and e.status='closed'
    ), v_conv.updated_at));
  if v_requeue then
    update public.atendhub_leads
    set stage='new', owner_id=null, assigned_at=null, claimed_at=null, first_response_at=null,
      queue_entered_at=now(), updated_at=now()
    where id=v_conv.lead_id and organization_id=c.organization_id and client_id=c.client_id;
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
      status = case when v_requeue then 'open' else status end,
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
