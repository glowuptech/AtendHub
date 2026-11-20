begin;
alter table public.atendhub_eve_reminders add column outbound_body text;

create or replace function public.atendhub_eve_claim(p_client uuid,p_instance text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item record;
begin
  select r.id,r.code,a.starts_at,a.timezone,(r.notification_only or (r.slot=2 and r.first_attempt_at is null)) as notice,r.outbound_body,c.id as conversation,c.phone into item
  from public.atendhub_eve_reminders r join public.atendhub_appointments a on a.id=r.appointment_id
  join public.atendhub_inbox_conversations c on c.lead_id=a.lead_id and c.client_id=a.client_id
    and c.organization_id=a.organization_id and c.status='open'
  join public.atendhub_whatsapp_connections w on w.id=c.connection_id
  where a.client_id=p_client and w.instance_name=p_instance and w.status='connected'
    and (a.status='awaiting_confirmation' or (a.status='confirmed' and r.slot=2 and (r.notification_only or r.first_attempt_at is null))) and r.invalidated_at is null and r.sent_at is null
    and (r.conversation_id=c.id or (r.conversation_id is null and not exists (
      select 1 from public.atendhub_inbox_conversations other where other.lead_id=a.lead_id
        and other.connection_id=c.connection_id and other.status='open' and other.id<>c.id)))
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
    coalesce(r.outbound_body,public.atendhub_reminder_text(r.starts_at,a.timezone,r.code,r.notification_only)),p_sent_at);
  if not exists(select 1 from public.atendhub_inbox_messages m
    where m.connection_id=c.connection_id and m.conversation_id=c.id and m.direction='outbound'
      and m.provider_message_id=p_provider_id and m.body=coalesce(r.outbound_body,public.atendhub_reminder_text(r.starts_at,a.timezone,r.code,r.notification_only))) then
    raise exception 'DELIVERY_MESSAGE_CONFLICT';
  end if;
  if not r.notification_only then perform public.atendhub_eve_reconcile(r.id); end if;
end $$;


create function public.atendhub_eve_claim(p_client uuid,p_instance text,p_public_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reserved jsonb; body text; origin text:=rtrim(trim(p_public_origin),'/');
begin
  if origin is null or origin !~ '^https://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$'
      or length(origin)>253 then raise exception 'INVALID_PUBLIC_ORIGIN'; end if;
  reserved:=public.atendhub_eve_claim(p_client,p_instance);
  if reserved is null or reserved->>'purpose'<>'confirmation' then return reserved; end if;
  -- Keep the same text if a reservation has already been handed to the provider.
  update public.atendhub_eve_reminders r set outbound_body=
    'Olá! Aqui é a equipe de '||left(regexp_replace(cli.name,'[[:cntrl:]]',' ','g'),150)||'.'
    ||chr(10)||'Sua consulta com '||left(regexp_replace(p.name,'[[:cntrl:]]',' ','g'),150)
    ||' está marcada para '||to_char(a.starts_at at time zone a.timezone,'DD/MM/YYYY às HH24:MI')||'.'
    ||chr(10)||'Confirme ou avise se não puder comparecer até '
    ||to_char((a.starts_at-interval '30 minutes') at time zone a.timezone,'DD/MM às HH24:MI')||':'
    ||chr(10)||origin||'/confirmar/'||r.public_token::text
  from public.atendhub_appointments a
  join public.atendhub_clients cli on cli.id=a.client_id and cli.organization_id=a.organization_id
  join public.atendhub_professionals p on p.id=a.professional_id and p.organization_id=a.organization_id and p.client_id=a.client_id
  where r.id=(reserved->>'requestId')::uuid and a.id=r.appointment_id and r.slot=1
    and r.outbound_body is null and r.first_attempt_at=now()
    and a.starts_at>now()+interval '30 minutes'
  returning r.outbound_body into body;
  if body is null then return reserved; end if;
  return reserved||jsonb_build_object('body',body,'replyText',null,'confirmationUrl',origin||'/confirmar/'||right(body,36));
end $$;
revoke all on function public.atendhub_eve_claim(uuid,text,text) from public,anon,authenticated;
grant execute on function public.atendhub_eve_claim(uuid,text,text) to atendhub_integration;

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
  if v_conv.id is null and p_from_me and v_type='text' and v_body ~ '(CONFIRMO |Ref\. )[A-F0-9]{16}$' then
    select conv.* into v_conv from public.atendhub_eve_reminders r
      join public.atendhub_inbox_conversations conv on conv.id=r.conversation_id
      join public.atendhub_appointments ap on ap.id=r.appointment_id
      where r.code=right(v_body,16) and r.first_attempt_at is not null and conv.connection_id=c.id and conv.phone=v_phone
        and v_body=public.atendhub_reminder_text(r.starts_at,ap.timezone,r.code,r.notification_only);
  end if;
  if v_conv.id is null and p_from_me and v_type='text'
      and v_body ~ '/confirmar/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select conv.* into v_conv from public.atendhub_eve_reminders r
      join public.atendhub_inbox_conversations conv on conv.id=r.conversation_id
      where r.public_token=right(v_body,36)::uuid and r.outbound_body=v_body
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
