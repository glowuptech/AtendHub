-- Atend&Hub Inbox: conversas e mensagens persistidas de WhatsApp.
-- Todos os objetos usam o prefixo atendhub_. Nenhuma tabela existente é recriada.
-- Alterações em objetos existentes (somente aditivas/relaxantes):
--   * índices únicos auxiliares em atendhub_whatsapp_connections e atendhub_leads
--     (necessários para FKs compostas que impedem misturar organização/cliente);
--   * atendhub_lead_events.actor_id passa a aceitar NULL (eventos de sistema,
--     como a origem de um lead criado pela integração, não têm usuário real).
begin;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'atendhub_integration') then
    create role atendhub_integration nologin;
  end if;
end
$$;
grant usage on schema public to atendhub_integration;

create unique index if not exists atendhub_whatsapp_connections_scope_key
  on public.atendhub_whatsapp_connections (id, organization_id, client_id);
create unique index if not exists atendhub_leads_scope_key
  on public.atendhub_leads (id, organization_id, client_id);
alter table public.atendhub_lead_events alter column actor_id drop not null;

-- ---------------------------------------------------------------- conversas
create table public.atendhub_inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  connection_id uuid not null,
  lead_id uuid not null,
  remote_jid text not null check (remote_jid ~ '^[1-9][0-9]{6,14}@s\.whatsapp\.net$'),
  phone text not null check (phone ~ '^[1-9][0-9]{6,14}$'),
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_read_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint atendhub_inbox_conversations_connection_scope_fkey
    foreign key (connection_id, organization_id, client_id)
    references public.atendhub_whatsapp_connections (id, organization_id, client_id),
  constraint atendhub_inbox_conversations_lead_scope_fkey
    foreign key (lead_id, organization_id, client_id)
    references public.atendhub_leads (id, organization_id, client_id) on delete cascade,
  constraint atendhub_inbox_conversations_connection_jid_key unique (connection_id, remote_jid),
  constraint atendhub_inbox_conversations_scope_key
    unique (id, organization_id, client_id, connection_id)
);
create index atendhub_inbox_conversations_list_idx
  on public.atendhub_inbox_conversations (organization_id, client_id, last_message_at desc nulls last);
create index atendhub_inbox_conversations_lead_idx
  on public.atendhub_inbox_conversations (lead_id);

-- ---------------------------------------------------------------- mensagens
create table public.atendhub_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  connection_id uuid not null,
  conversation_id uuid not null,
  provider_message_id text check (provider_message_id is null or length(provider_message_id) between 1 and 200),
  direction text not null check (direction in ('inbound', 'outbound')),
  origin text not null check (origin in ('contact', 'inbox', 'external_device')),
  message_type text not null default 'text'
    check (message_type in ('text','image','audio','video','document','sticker','location','contact','reaction','unknown')),
  body text not null default '' check (length(body) <= 65536),
  media jsonb not null default '{}'::jsonb
    check (jsonb_typeof(media) = 'object' and pg_catalog.octet_length(media::text) <= 4096),
  provider_meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_meta) = 'object' and pg_catalog.octet_length(provider_meta::text) <= 4096),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.now(),
  author_id uuid references auth.users (id) on delete set null,
  status text not null,
  status_updated_at timestamptz not null default pg_catalog.now(),
  failure_reason text check (failure_reason is null or length(failure_reason) <= 500),
  request_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint atendhub_inbox_messages_conversation_scope_fkey
    foreign key (conversation_id, organization_id, client_id, connection_id)
    references public.atendhub_inbox_conversations (id, organization_id, client_id, connection_id)
    on delete cascade,
  constraint atendhub_inbox_messages_direction_origin_check check (
    (direction = 'inbound' and origin = 'contact')
    or (direction = 'outbound' and origin in ('inbox', 'external_device'))),
  constraint atendhub_inbox_messages_status_check check (
    (direction = 'inbound' and status = 'received')
    or (direction = 'outbound' and status in ('pending','uncertain','failed','sent','delivered','read'))),
  constraint atendhub_inbox_messages_author_check check (author_id is null or origin = 'inbox'),
  constraint atendhub_inbox_messages_inbox_request_check check (
    origin <> 'inbox' or (request_id is not null and length(body) between 1 and 6000 and message_type = 'text'))
);
create unique index atendhub_inbox_messages_provider_key
  on public.atendhub_inbox_messages (connection_id, provider_message_id)
  where provider_message_id is not null;
create unique index atendhub_inbox_messages_request_key
  on public.atendhub_inbox_messages (organization_id, request_id)
  where request_id is not null;
create index atendhub_inbox_messages_history_idx
  on public.atendhub_inbox_messages (conversation_id, occurred_at desc, id desc);

-- Eventos de envio solicitados pelo Inbox (o payload NUNCA contém a API key).
create table public.atendhub_inbox_send_events (
  id uuid primary key,
  organization_id uuid not null,
  message_id uuid not null unique references public.atendhub_inbox_messages (id) on delete cascade,
  event_type text not null default 'inbox.message.send_requested'
    check (event_type = 'inbox.message.send_requested'),
  payload jsonb not null check (not (payload ? 'apiKey') and not (payload -> 'connection' ? 'apiKey')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending','delivered','retry')),
  attempts integer not null default 0,
  last_outcome text check (last_outcome in ('sent','failed','uncertain')),
  last_attempt_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

-- Recibos (entregue/lido/falha) que chegam antes da mensagem ou fora de ordem.
create table public.atendhub_inbox_message_receipts (
  connection_id uuid not null references public.atendhub_whatsapp_connections (id) on delete cascade,
  provider_message_id text not null check (length(provider_message_id) between 1 and 200),
  organization_id uuid not null,
  status text not null check (status in ('sent','delivered','read','failed')),
  reason text check (reason is null or length(reason) <= 500),
  occurred_at timestamptz not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (connection_id, provider_message_id)
);

-- Mensagens que não puderam ser vinculadas com segurança a um lead.
create table public.atendhub_inbox_unresolved (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  connection_id uuid not null references public.atendhub_whatsapp_connections (id) on delete cascade,
  provider_message_id text not null,
  reason text not null check (reason in ('pending_identity', 'ambiguous_lead')),
  remote_jid text not null,
  remote_phone text,
  from_me boolean not null,
  candidate_lead_ids uuid[] not null default '{}',
  payload jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  unique (connection_id, provider_message_id)
);

-- ---------------------------------------------------------------- helpers
create function public.atendhub_inbox_status_rank(p_status text)
returns integer language sql immutable set search_path = ''
as $$
  select case p_status
    when 'sent' then 2 when 'delivered' then 3 when 'read' then 4
    when 'uncertain' then 1 when 'failed' then 1 else 0 end
$$;

-- Próximo estado de uma mensagem enviada. Estados mais avançados nunca regridem.
create function public.atendhub_inbox_next_status(p_current text, p_new text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when p_new in ('delivered', 'read')
      then case when public.atendhub_inbox_status_rank(p_new) > public.atendhub_inbox_status_rank(p_current) then p_new else p_current end
    when p_new = 'sent' then case when p_current in ('pending','uncertain','failed') then 'sent' else p_current end
    when p_new = 'failed' then case when p_current in ('pending','uncertain') then 'failed' else p_current end
    when p_new = 'uncertain' then case when p_current = 'pending' then 'uncertain' else p_current end
    when p_new = 'pending' then case when p_current = 'failed' then 'pending' else p_current end
    else p_current end
$$;

create function public.atendhub_inbox_preview(p_type text, p_body text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when p_type = 'text' then pg_catalog.left(p_body, 200)
    when p_body <> '' then pg_catalog.left(p_body, 200)
    else case p_type when 'image' then '[Imagem]' when 'audio' then '[Áudio]' when 'video' then '[Vídeo]'
      when 'document' then '[Documento]' when 'sticker' then '[Figurinha]' when 'location' then '[Localização]'
      when 'contact' then '[Contato]' when 'reaction' then '[Reação]' else '[Mensagem não suportada]' end
  end
$$;

-- Acesso de leitura: lead atribuído ao usuário, dentro do cliente autorizado,
-- ou supervisão explícita pela permissão inbox.supervise. Nada é implícito.
create function public.atendhub_inbox_can_access(p_org uuid, p_client uuid, p_lead uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.atendhub_is_active_member(p_org)
    and public.atendhub_has_client_access(p_org, p_client)
    and (
      exists (select 1 from public.atendhub_leads l
              where l.id = p_lead and l.organization_id = p_org and l.client_id = p_client
                and l.owner_id = (select auth.uid()))
      or exists (select 1 from public.atendhub_team_member_permissions p
                 where p.team_member_id = (select auth.uid()) and p.organization_id = p_org
                   and p.permission_key = 'inbox.supervise' and p.grant_level in ('all', 'team'))
    )
$$;

create function public.atendhub_inbox_can_access_conversation(p_conversation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.atendhub_inbox_conversations c
    where c.id = p_conversation
      and public.atendhub_inbox_can_access(c.organization_id, c.client_id, c.lead_id))
$$;

-- ---------------------------------------------------------------- RLS
alter table public.atendhub_inbox_conversations enable row level security;
alter table public.atendhub_inbox_messages enable row level security;
alter table public.atendhub_inbox_send_events enable row level security;
alter table public.atendhub_inbox_message_receipts enable row level security;
alter table public.atendhub_inbox_unresolved enable row level security;

revoke all on public.atendhub_inbox_conversations, public.atendhub_inbox_messages,
  public.atendhub_inbox_send_events, public.atendhub_inbox_message_receipts,
  public.atendhub_inbox_unresolved from public, anon, authenticated;
grant select on public.atendhub_inbox_conversations, public.atendhub_inbox_messages to authenticated;
grant select, insert, update, delete on public.atendhub_inbox_conversations, public.atendhub_inbox_messages,
  public.atendhub_inbox_send_events, public.atendhub_inbox_message_receipts,
  public.atendhub_inbox_unresolved to service_role;

create policy atendhub_inbox_conversations_select on public.atendhub_inbox_conversations
  for select to authenticated
  using (public.atendhub_inbox_can_access(organization_id, client_id, lead_id));
create policy atendhub_inbox_messages_select on public.atendhub_inbox_messages
  for select to authenticated
  using (public.atendhub_inbox_can_access_conversation(conversation_id));

revoke all on function public.atendhub_inbox_status_rank(text), public.atendhub_inbox_next_status(text, text),
  public.atendhub_inbox_preview(text, text), public.atendhub_inbox_can_access(uuid, uuid, uuid),
  public.atendhub_inbox_can_access_conversation(uuid) from public, anon, authenticated;
grant execute on function public.atendhub_inbox_can_access(uuid, uuid, uuid),
  public.atendhub_inbox_can_access_conversation(uuid) to authenticated, service_role;
grant execute on function public.atendhub_inbox_status_rank(text), public.atendhub_inbox_next_status(text, text),
  public.atendhub_inbox_preview(text, text) to authenticated, service_role, atendhub_integration;

-- Realtime respeita as políticas acima (apenas SELECT).
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.atendhub_inbox_conversations, public.atendhub_inbox_messages;
  end if;
end
$$;

-- ---------------------------------------------------------------- atualização de conversa
create function public.atendhub_inbox_refresh_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare m public.atendhub_inbox_messages;
begin
  select * into m from public.atendhub_inbox_messages
  where conversation_id = p_conversation_id order by occurred_at desc, id desc limit 1;
  update public.atendhub_inbox_conversations
  set last_message_id = m.id, last_message_at = m.occurred_at,
      last_message_preview = case when m.id is null then '' else public.atendhub_inbox_preview(m.message_type, m.body) end,
      last_inbound_at = (select max(occurred_at) from public.atendhub_inbox_messages where conversation_id = p_conversation_id and direction = 'inbound'),
      last_outbound_at = (select max(occurred_at) from public.atendhub_inbox_messages where conversation_id = p_conversation_id and direction = 'outbound'),
      updated_at = pg_catalog.now()
  where id = p_conversation_id;
end;
$$;
revoke all on function public.atendhub_inbox_refresh_conversation(uuid) from public, anon, authenticated;
grant execute on function public.atendhub_inbox_refresh_conversation(uuid) to service_role;

-- ---------------------------------------------------------------- ingestão (n8n)
create function public.atendhub_ingest_whatsapp_message(
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
    return pg_catalog.jsonb_build_object('ok', true, 'outcome', 'duplicate', 'duplicate', true,
      'leadId', null, 'conversationId', v_msg.conversation_id, 'messageId', v_msg.id);
  end if;

  select * into v_conv from public.atendhub_inbox_conversations
  where connection_id = c.id and remote_jid = v_phone || '@s.whatsapp.net';
  if found then
    v_lead_id := v_conv.lead_id;
  else
    if p_lead_id is not null then
      select * into v_unres from public.atendhub_inbox_unresolved
      where connection_id = c.id and provider_message_id = v_pmid
        and reason = 'ambiguous_lead' and resolved_at is null;
      if not found or not (p_lead_id = any (v_unres.candidate_lead_ids)) then
        raise exception 'LEAD_OVERRIDE_NOT_ALLOWED';
      end if;
      v_lead_id := p_lead_id;
    else
      select coalesce(pg_catalog.array_agg(l.id order by l.created_at, l.id), '{}') into v_candidates
      from public.atendhub_leads l
      where l.organization_id = c.organization_id and l.client_id = c.client_id
        and (pg_catalog.regexp_replace(l.phone, '\D', '', 'g') = v_phone
          or (length(pg_catalog.regexp_replace(l.phone, '\D', '', 'g')) in (10, 11)
              and '55' || pg_catalog.regexp_replace(l.phone, '\D', '', 'g') = v_phone));
      if coalesce(pg_catalog.array_length(v_candidates, 1), 0) > 1 then
        insert into public.atendhub_inbox_unresolved
          (organization_id, client_id, connection_id, provider_message_id, reason, remote_jid, remote_phone, from_me, candidate_lead_ids, payload)
        values (c.organization_id, c.client_id, c.id, v_pmid, 'ambiguous_lead', v_jid, v_phone, p_from_me, v_candidates,
          pg_catalog.jsonb_build_object('type', v_type, 'body', v_body, 'timestamp', v_ts, 'contactName', p_contact_name,
            'correlationId', p_correlation_id, 'media', v_media, 'meta', v_meta))
        on conflict (connection_id, provider_message_id) do nothing;
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
    on conflict (connection_id, remote_jid) do nothing;
    select * into v_conv from public.atendhub_inbox_conversations
    where connection_id = c.id and remote_jid = v_phone || '@s.whatsapp.net';
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
create function public.atendhub_inbox_record_message_status(
  p_instance_name text,
  p_provider_message_id text,
  p_status text,
  p_occurred_at timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.atendhub_whatsapp_connections;
  v_pmid text := pg_catalog.btrim(coalesce(p_provider_message_id, ''));
  v_when timestamptz := least(coalesce(p_occurred_at, pg_catalog.now()), pg_catalog.now() + interval '5 minutes');
  m public.atendhub_inbox_messages;
  v_next text;
begin
  if p_status is null or p_status not in ('sent', 'delivered', 'read', 'failed') then
    raise exception 'INVALID_STATUS';
  end if;
  if v_pmid = '' or length(v_pmid) > 200 then raise exception 'INVALID_PROVIDER_MESSAGE_ID'; end if;
  select * into c from public.atendhub_whatsapp_connections
  where instance_name = pg_catalog.btrim(coalesce(p_instance_name, '')) and status <> 'deleted';
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'outcome', 'instance_not_found');
  end if;

  -- Mantém o recibo mais avançado para mensagens ainda desconhecidas ou eventos fora de ordem.
  insert into public.atendhub_inbox_message_receipts
    (connection_id, provider_message_id, organization_id, status, reason, occurred_at)
  values (c.id, v_pmid, c.organization_id, p_status, pg_catalog.left(p_reason, 500), v_when)
  on conflict (connection_id, provider_message_id) do update
    set status = excluded.status, reason = excluded.reason,
        occurred_at = excluded.occurred_at, updated_at = pg_catalog.now()
    where public.atendhub_inbox_status_rank(excluded.status)
          > public.atendhub_inbox_status_rank(public.atendhub_inbox_message_receipts.status)
       or (excluded.status = 'failed' and public.atendhub_inbox_message_receipts.status = 'sent');

  select * into m from public.atendhub_inbox_messages
  where connection_id = c.id and provider_message_id = v_pmid for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', true, 'outcome', 'stored_for_later');
  end if;
  if m.direction <> 'outbound' then
    return pg_catalog.jsonb_build_object('ok', true, 'outcome', 'ignored_inbound', 'messageId', m.id);
  end if;
  v_next := public.atendhub_inbox_next_status(m.status, p_status);
  if v_next <> m.status then
    update public.atendhub_inbox_messages
    set status = v_next, status_updated_at = pg_catalog.now(), updated_at = pg_catalog.now(),
        failure_reason = case when v_next = 'failed' then pg_catalog.left(p_reason, 500) else failure_reason end
    where id = m.id;
  end if;
  return pg_catalog.jsonb_build_object('ok', true,
    'outcome', case when v_next <> m.status then 'applied' else 'unchanged' end,
    'messageId', m.id, 'status', v_next);
end;
$$;

-- ---------------------------------------------------------------- envio pelo Inbox
create function public.atendhub_inbox_request_send(
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

-- Resultado do envio: chamado pelo servidor (service_role) ou pelo n8n (atendhub_integration).
create function public.atendhub_inbox_apply_send_result(
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
    if found and v_lead.first_response_at is null and m.author_id is not null then
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

create function public.atendhub_inbox_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_conv public.atendhub_inbox_conversations;
begin
  select * into v_conv from public.atendhub_inbox_conversations where id = p_conversation_id;
  if not found
     or not public.atendhub_is_active_member(v_conv.organization_id)
     or not public.atendhub_has_client_access(v_conv.organization_id, v_conv.client_id)
     or not exists (select 1 from public.atendhub_leads l
                    where l.id = v_conv.lead_id and l.organization_id = v_conv.organization_id
                      and l.owner_id = (select auth.uid())) then
    raise exception using errcode = '42501', message = 'INBOX_READ_FORBIDDEN';
  end if;
  update public.atendhub_inbox_conversations
  set unread_count = 0, last_read_at = pg_catalog.now()
  where id = v_conv.id and unread_count > 0;
end;
$$;

revoke all on function public.atendhub_ingest_whatsapp_message(text, text, text, boolean, text, text, timestamptz, uuid, text, text, jsonb, jsonb, uuid),
  public.atendhub_inbox_record_message_status(text, text, text, timestamptz, text),
  public.atendhub_inbox_request_send(uuid, uuid, text),
  public.atendhub_inbox_apply_send_result(uuid, text, text, text),
  public.atendhub_inbox_mark_read(uuid) from public, anon, authenticated;
grant execute on function public.atendhub_ingest_whatsapp_message(text, text, text, boolean, text, text, timestamptz, uuid, text, text, jsonb, jsonb, uuid),
  public.atendhub_inbox_record_message_status(text, text, text, timestamptz, text),
  public.atendhub_inbox_apply_send_result(uuid, text, text, text) to service_role, atendhub_integration;
grant execute on function public.atendhub_inbox_request_send(uuid, uuid, text),
  public.atendhub_inbox_mark_read(uuid) to authenticated, service_role;

comment on function public.atendhub_ingest_whatsapp_message(text, text, text, boolean, text, text, timestamptz, uuid, text, text, jsonb, jsonb, uuid) is
  'Ingestão transacional e idempotente de mensagens do WhatsApp (n8n). Resolve conexão pela instância, reutiliza ou cria lead, cria/reutiliza conversa e registra a mensagem. Retorna outcome explícito.';

commit;
