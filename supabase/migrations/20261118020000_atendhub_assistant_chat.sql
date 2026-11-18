begin;

create table public.atendhub_assistant_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  connection_id uuid not null,
  conversation_id uuid not null,
  requester_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atendhub_assistant_threads_scope_fkey
    foreign key (conversation_id, organization_id, client_id, connection_id)
    references public.atendhub_inbox_conversations (id, organization_id, client_id, connection_id)
    on delete cascade,
  constraint atendhub_assistant_threads_requester_fkey
    foreign key (requester_id, organization_id)
    references public.atendhub_team_members (id, organization_id)
    on delete cascade,
  constraint atendhub_assistant_threads_owner_scope_key
    unique (id, organization_id, client_id, conversation_id, requester_id),
  constraint atendhub_assistant_threads_user_scope_key
    unique (organization_id, client_id, conversation_id, requester_id)
);

create table public.atendhub_assistant_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default gen_random_uuid() unique,
  request_id uuid not null,
  organization_id uuid not null,
  client_id uuid not null,
  connection_id uuid not null,
  conversation_id uuid not null,
  thread_id uuid not null,
  requester_id uuid not null,
  question text not null check (length(question) between 1 and 2000),
  status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed', 'uncertain')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text check (error_message is null or length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint atendhub_assistant_requests_thread_scope_fkey
    foreign key (thread_id, organization_id, client_id, conversation_id, requester_id)
    references public.atendhub_assistant_threads (id, organization_id, client_id, conversation_id, requester_id)
    on delete cascade,
  constraint atendhub_assistant_requests_idempotency_key
    unique (thread_id, request_id),
  constraint atendhub_assistant_requests_row_scope_key
    unique (id, thread_id, organization_id, client_id, conversation_id, requester_id)
);

create table public.atendhub_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  conversation_id uuid not null,
  thread_id uuid not null,
  request_row_id uuid not null,
  requester_id uuid not null,
  role text not null check (role in ('question', 'answer')),
  content text not null check (length(content) between 1 and 12000),
  sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources) = 'array' and octet_length(sources::text) <= 12000),
  suggested_reply text check (suggested_reply is null or length(suggested_reply) <= 6000),
  created_at timestamptz not null default now(),
  constraint atendhub_assistant_messages_request_scope_fkey
    foreign key (request_row_id, thread_id, organization_id, client_id, conversation_id, requester_id)
    references public.atendhub_assistant_requests (id, thread_id, organization_id, client_id, conversation_id, requester_id)
    on delete cascade,
  constraint atendhub_assistant_messages_request_role_key
    unique (request_row_id, role),
  constraint atendhub_assistant_messages_answer_fields_check
    check (role = 'answer' or (sources = '[]'::jsonb and suggested_reply is null))
);

create index atendhub_assistant_threads_user_history_idx
  on public.atendhub_assistant_threads (requester_id, conversation_id, updated_at desc);
create index atendhub_assistant_requests_thread_history_idx
  on public.atendhub_assistant_requests (thread_id, created_at desc, id desc);
create unique index atendhub_assistant_requests_one_processing_per_thread
  on public.atendhub_assistant_requests (thread_id) where status = 'processing';
create index atendhub_assistant_messages_thread_history_idx
  on public.atendhub_assistant_messages (thread_id, created_at desc, id desc);

create function public.atendhub_assistant_can_access_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.atendhub_assistant_threads t
    where t.id = p_thread_id
      and public.atendhub_is_active_member(t.organization_id)
      and public.atendhub_has_client_access(t.organization_id, t.client_id)
      and public.atendhub_inbox_can_access_conversation(t.conversation_id)
      and (
        t.requester_id = (select auth.uid())
        or exists (
          select 1
          from public.atendhub_team_member_permissions p
          where p.team_member_id = (select auth.uid())
            and p.organization_id = t.organization_id
            and p.permission_key = 'inbox.supervise'
            and p.grant_level in ('team', 'all')
        )
      )
  )
$$;

alter table public.atendhub_assistant_threads enable row level security;
alter table public.atendhub_assistant_requests enable row level security;
alter table public.atendhub_assistant_messages enable row level security;

revoke all on public.atendhub_assistant_threads, public.atendhub_assistant_requests,
  public.atendhub_assistant_messages from public, anon, authenticated;
grant select on public.atendhub_assistant_threads, public.atendhub_assistant_requests,
  public.atendhub_assistant_messages to authenticated;
grant all on public.atendhub_assistant_threads, public.atendhub_assistant_requests,
  public.atendhub_assistant_messages to service_role;

create policy atendhub_assistant_threads_select
  on public.atendhub_assistant_threads for select to authenticated
  using (public.atendhub_assistant_can_access_thread(id));
create policy atendhub_assistant_requests_select
  on public.atendhub_assistant_requests for select to authenticated
  using (public.atendhub_assistant_can_access_thread(thread_id));
create policy atendhub_assistant_messages_select
  on public.atendhub_assistant_messages for select to authenticated
  using (public.atendhub_assistant_can_access_thread(thread_id));

create function public.atendhub_assistant_begin_request(
  p_conversation_id uuid,
  p_request_id uuid,
  p_thread_id uuid,
  p_question text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.atendhub_inbox_conversations;
  v_thread public.atendhub_assistant_threads;
  v_request public.atendhub_assistant_requests;
  v_other_processing uuid;
begin
  if auth.uid() is null or p_request_id is null or length(pg_catalog.btrim(coalesce(p_question, ''))) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'ASSISTANT_INVALID_REQUEST';
  end if;

  select * into v_conversation
  from public.atendhub_inbox_conversations c
  where c.id = p_conversation_id;
  if not found
    or not public.atendhub_is_active_member(v_conversation.organization_id)
    or not public.atendhub_has_client_access(v_conversation.organization_id, v_conversation.client_id)
    or not public.atendhub_inbox_can_access(v_conversation.organization_id, v_conversation.client_id, v_conversation.lead_id) then
    raise exception using errcode = '42501', message = 'ASSISTANT_ACCESS_DENIED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('atendhub_assistant:' || p_conversation_id::text || ':' || auth.uid()::text, 0)
  );

  if p_thread_id is null then
    select * into v_thread
    from public.atendhub_assistant_threads t
    where t.organization_id = v_conversation.organization_id
      and t.client_id = v_conversation.client_id
      and t.conversation_id = v_conversation.id
      and t.requester_id = auth.uid()
    for update;
  else
    select * into v_thread
    from public.atendhub_assistant_threads t
    where t.id = p_thread_id
      and t.organization_id = v_conversation.organization_id
      and t.client_id = v_conversation.client_id
      and t.connection_id = v_conversation.connection_id
      and t.conversation_id = v_conversation.id
      and t.requester_id = auth.uid()
    for update;
    if not found then
      raise exception using errcode = '42501', message = 'ASSISTANT_THREAD_CONFLICT';
    end if;
  end if;

  if v_thread.id is null then
    insert into public.atendhub_assistant_threads (
      organization_id, client_id, connection_id, conversation_id, requester_id
    ) values (
      v_conversation.organization_id, v_conversation.client_id, v_conversation.connection_id,
      v_conversation.id, auth.uid()
    ) returning * into v_thread;
  end if;

  select * into v_request
  from public.atendhub_assistant_requests r
  where r.thread_id = v_thread.id and r.request_id = p_request_id
  for update;

  if found then
    if v_request.question <> pg_catalog.btrim(p_question) then
      raise exception using errcode = '23505', message = 'ASSISTANT_REQUEST_ID_CONFLICT';
    end if;
    if v_request.status in ('succeeded', 'processing') then
      return pg_catalog.jsonb_build_object(
        'threadId', v_thread.id, 'requestRowId', v_request.id,
        'requestId', v_request.request_id, 'eventId', v_request.event_id,
        'status', v_request.status, 'attempt', v_request.attempt_count,
        'shouldDispatch', false
      );
    end if;
  end if;

  select r.id into v_other_processing
  from public.atendhub_assistant_requests r
  where r.thread_id = v_thread.id and r.status = 'processing'
    and (v_request.id is null or r.id <> v_request.id)
  limit 1;
  if v_other_processing is not null then
    raise exception using errcode = '55P03', message = 'ASSISTANT_REQUEST_IN_PROGRESS';
  end if;

  if v_request.id is null then
    insert into public.atendhub_assistant_requests (
      request_id, organization_id, client_id, connection_id, conversation_id,
      thread_id, requester_id, question, status, attempt_count
    ) values (
      p_request_id, v_conversation.organization_id, v_conversation.client_id,
      v_conversation.connection_id, v_conversation.id, v_thread.id, auth.uid(),
      pg_catalog.btrim(p_question), 'processing', 1
    ) returning * into v_request;
    insert into public.atendhub_assistant_messages (
      organization_id, client_id, conversation_id, thread_id, request_row_id,
      requester_id, role, content
    ) values (
      v_conversation.organization_id, v_conversation.client_id, v_conversation.id,
      v_thread.id, v_request.id, auth.uid(), 'question', v_request.question
    );
  else
    update public.atendhub_assistant_requests
    set status = 'processing', attempt_count = attempt_count + 1,
        error_message = null, started_at = pg_catalog.now(), finished_at = null,
        updated_at = pg_catalog.now()
    where id = v_request.id
    returning * into v_request;
  end if;

  update public.atendhub_assistant_threads
  set updated_at = pg_catalog.now()
  where id = v_thread.id;

  return pg_catalog.jsonb_build_object(
    'threadId', v_thread.id, 'requestRowId', v_request.id,
    'requestId', v_request.request_id, 'eventId', v_request.event_id,
    'status', v_request.status, 'attempt', v_request.attempt_count,
    'shouldDispatch', true
  );
end
$$;

create function public.atendhub_assistant_finish_request(
  p_event_id uuid,
  p_attempt integer,
  p_status text,
  p_error_message text,
  p_answer text,
  p_sources jsonb,
  p_suggested_reply text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.atendhub_assistant_requests;
begin
  if p_status not in ('succeeded', 'failed', 'uncertain')
    or (p_status = 'succeeded' and length(pg_catalog.btrim(coalesce(p_answer, ''))) not between 1 and 12000)
    or (p_status <> 'succeeded' and length(coalesce(p_error_message, '')) > 1000)
    or jsonb_typeof(coalesce(p_sources, '[]'::jsonb)) is distinct from 'array'
    or pg_catalog.octet_length(coalesce(p_sources, '[]'::jsonb)::text) > 12000
    or length(coalesce(p_suggested_reply, '')) > 6000 then
    raise exception using errcode = '22023', message = 'ASSISTANT_INVALID_RESULT';
  end if;

  select * into v_request
  from public.atendhub_assistant_requests r
  where r.event_id = p_event_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ASSISTANT_EVENT_NOT_FOUND';
  end if;
  if v_request.status <> 'processing' or v_request.attempt_count <> p_attempt then
    return pg_catalog.jsonb_build_object('applied', false, 'status', v_request.status, 'stale', true);
  end if;

  if p_status = 'succeeded' then
    insert into public.atendhub_assistant_messages (
      organization_id, client_id, conversation_id, thread_id, request_row_id,
      requester_id, role, content, sources, suggested_reply
    ) values (
      v_request.organization_id, v_request.client_id, v_request.conversation_id,
      v_request.thread_id, v_request.id, v_request.requester_id, 'answer',
      pg_catalog.btrim(p_answer), coalesce(p_sources, '[]'::jsonb), nullif(p_suggested_reply, '')
    ) on conflict (request_row_id, role) do nothing;
  end if;

  update public.atendhub_assistant_requests
  set status = p_status,
      error_message = case when p_status = 'succeeded' then null else left(coalesce(p_error_message, 'Não foi possível obter uma resposta confirmada.'), 1000) end,
      finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = v_request.id;
  update public.atendhub_assistant_threads
  set updated_at = pg_catalog.now()
  where id = v_request.thread_id;

  return pg_catalog.jsonb_build_object('applied', true, 'status', p_status, 'stale', false);
end
$$;

create function public.atendhub_update_client_knowledge(
  p_client_id uuid,
  p_knowledge jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.atendhub_team_members;
  v_override text;
  v_entry jsonb;
  v_knowledge jsonb := coalesce(p_knowledge, '[]'::jsonb);
  v_updated jsonb;
begin
  if auth.uid() is null or jsonb_typeof(v_knowledge) is distinct from 'array'
    or jsonb_array_length(v_knowledge) > 200 then
    raise exception using errcode = '22023', message = 'KNOWLEDGE_INVALID';
  end if;

  select * into v_member
  from public.atendhub_team_members m
  where m.id = auth.uid() and m.status = 'active';
  if not found or not public.atendhub_has_client_access(v_member.organization_id, p_client_id) then
    raise exception using errcode = '42501', message = 'KNOWLEDGE_ACCESS_DENIED';
  end if;

  select p.grant_level into v_override
  from public.atendhub_team_member_permissions p
  where p.team_member_id = v_member.id and p.organization_id = v_member.organization_id
    and p.permission_key = 'knowledge.edit';
  if (found and v_override <> 'all')
    or (not found and v_member.role not in ('manager', 'super_admin')) then
    raise exception using errcode = '42501', message = 'KNOWLEDGE_EDIT_FORBIDDEN';
  end if;

  for v_entry in select value from jsonb_array_elements(v_knowledge) loop
    if jsonb_typeof(v_entry) is distinct from 'object'
      or coalesce(v_entry ->> 'id', '') = ''
      or coalesce(v_entry ->> 'status', '') not in ('draft', 'pending', 'approved') then
      raise exception using errcode = '22023', message = 'KNOWLEDGE_INVALID_ENTRY';
    end if;
    if v_entry ->> 'status' = 'approved'
      and (length(pg_catalog.btrim(coalesce(v_entry ->> 'answer', ''))) = 0
        or length(pg_catalog.btrim(coalesce(v_entry ->> 'source', ''))) = 0) then
      raise exception using errcode = '22023', message = 'KNOWLEDGE_APPROVED_REQUIRES_SOURCE';
    end if;
  end loop;

  update public.atendhub_clients c
  set metadata = coalesce(c.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object('knowledge', v_knowledge),
      updated_at = pg_catalog.now()
  where c.id = p_client_id and c.organization_id = v_member.organization_id
  returning c.metadata -> 'knowledge' into v_updated;
  if not found then
    raise exception using errcode = 'P0002', message = 'KNOWLEDGE_CLIENT_NOT_FOUND';
  end if;
  return v_updated;
end
$$;

revoke all on function public.atendhub_assistant_can_access_thread(uuid) from public, anon;
revoke all on function public.atendhub_assistant_begin_request(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.atendhub_assistant_finish_request(uuid, integer, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.atendhub_update_client_knowledge(uuid, jsonb) from public, anon;
grant execute on function public.atendhub_assistant_can_access_thread(uuid) to authenticated, service_role;
grant execute on function public.atendhub_assistant_begin_request(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.atendhub_assistant_finish_request(uuid, integer, text, text, text, jsonb, text) to service_role;
grant execute on function public.atendhub_update_client_knowledge(uuid, jsonb) to authenticated;

commit;
