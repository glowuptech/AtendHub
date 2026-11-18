-- Atend&Hub: persistência de agenda (disponibilidade, agendamentos, histórico e notificações).
-- Escopo: somente objetos novos atendhub_* e dois índices únicos auxiliares nas tabelas atendhub_professionals e atendhub_leads.
-- Escritas ocorrem exclusivamente por RPCs SECURITY DEFINER; authenticated/anon só podem ler (RLS).

create extension if not exists btree_gist with schema extensions;

-- Chaves auxiliares para FKs compostas que impedem combinações organização/cliente/profissional/lead inconsistentes.
create unique index if not exists atendhub_professionals_id_org_client_key
  on public.atendhub_professionals (id, organization_id, client_id);
create unique index if not exists atendhub_leads_id_org_client_key
  on public.atendhub_leads (id, organization_id, client_id);
create unique index if not exists atendhub_clients_id_org_key2
  on public.atendhub_clients (id, organization_id);

-- 1) Preferências por profissional
create table public.atendhub_professional_schedule_settings (
  professional_id uuid primary key,
  organization_id uuid not null,
  client_id uuid not null,
  default_duration integer not null default 30 check (default_duration between 1 and 480),
  display_step integer not null default 30 check (display_step between 5 and 120),
  timezone text not null default 'America/Sao_Paulo',
  updated_by_id uuid,
  updated_at timestamptz not null default now(),
  foreign key (professional_id, organization_id, client_id)
    references public.atendhub_professionals (id, organization_id, client_id) on delete cascade
);

-- 2) Semanas configuradas e seus intervalos
create table public.atendhub_availability_weeks (
  professional_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  organization_id uuid not null,
  client_id uuid not null,
  updated_by_id uuid,
  updated_at timestamptz not null default now(),
  primary key (professional_id, week_start),
  foreign key (professional_id, organization_id, client_id)
    references public.atendhub_professionals (id, organization_id, client_id) on delete cascade
);

create table public.atendhub_availability_intervals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  professional_id uuid not null,
  week_start date not null,
  day date not null,
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440),
  check (start_minute < end_minute),
  check (day >= week_start and day <= week_start + 6),
  foreign key (professional_id, week_start)
    references public.atendhub_availability_weeks (professional_id, week_start) on delete cascade
);
create index atendhub_availability_intervals_lookup
  on public.atendhub_availability_intervals (professional_id, day);

-- 3) Agendamentos
create table public.atendhub_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  professional_id uuid not null,
  lead_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'awaiting_confirmation'
    check (status in ('awaiting_confirmation', 'confirmed', 'rescheduling', 'cancelled')),
  attendance text not null default 'unknown' check (attendance in ('unknown', 'present', 'absent')),
  source text not null default 'manual',
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 120),
  created_by_id uuid not null,
  cancelled_at timestamptz,
  cancelled_by_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '480 minutes'),
  foreign key (client_id, organization_id) references public.atendhub_clients (id, organization_id),
  foreign key (professional_id, organization_id, client_id)
    references public.atendhub_professionals (id, organization_id, client_id),
  foreign key (lead_id, organization_id, client_id)
    references public.atendhub_leads (id, organization_id, client_id),
  constraint atendhub_appointments_no_overlap exclude using gist (
    professional_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled')
);
create unique index atendhub_appointments_idempotency
  on public.atendhub_appointments (organization_id, idempotency_key) where idempotency_key is not null;
create index atendhub_appointments_client_time
  on public.atendhub_appointments (client_id, starts_at);
create index atendhub_appointments_professional_time
  on public.atendhub_appointments (professional_id, starts_at);
create index atendhub_appointments_lead
  on public.atendhub_appointments (lead_id);

-- 4) Histórico
create table public.atendhub_appointment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  appointment_id uuid not null references public.atendhub_appointments (id),
  event_type text not null check (event_type in ('created', 'rescheduled', 'status_changed', 'attendance_changed', 'cancelled')),
  actor_id uuid not null,
  from_value jsonb,
  to_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index atendhub_appointment_events_appointment
  on public.atendhub_appointment_events (appointment_id, created_at);

-- 5) Notificações externas (webhook appointment.created)
create table public.atendhub_appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  appointment_id uuid not null references public.atendhub_appointments (id),
  event_type text not null check (event_type in ('appointment.created')),
  payload jsonb not null,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'delivered', 'failed', 'not_configured')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (appointment_id, event_type)
);

-- RLS e permissões: leitura apenas
alter table public.atendhub_professional_schedule_settings enable row level security;
alter table public.atendhub_availability_weeks enable row level security;
alter table public.atendhub_availability_intervals enable row level security;
alter table public.atendhub_appointments enable row level security;
alter table public.atendhub_appointment_events enable row level security;
alter table public.atendhub_appointment_notifications enable row level security;

revoke all on public.atendhub_professional_schedule_settings from anon, authenticated;
revoke all on public.atendhub_availability_weeks from anon, authenticated;
revoke all on public.atendhub_availability_intervals from anon, authenticated;
revoke all on public.atendhub_appointments from anon, authenticated;
revoke all on public.atendhub_appointment_events from anon, authenticated;
revoke all on public.atendhub_appointment_notifications from anon, authenticated;
grant select on public.atendhub_professional_schedule_settings to authenticated;
grant select on public.atendhub_availability_weeks to authenticated;
grant select on public.atendhub_availability_intervals to authenticated;
grant select on public.atendhub_appointments to authenticated;
grant select on public.atendhub_appointment_events to authenticated;
grant select on public.atendhub_appointment_notifications to authenticated;
grant all on public.atendhub_professional_schedule_settings to service_role;
grant all on public.atendhub_availability_weeks to service_role;
grant all on public.atendhub_availability_intervals to service_role;
grant all on public.atendhub_appointments to service_role;
grant all on public.atendhub_appointment_events to service_role;
grant all on public.atendhub_appointment_notifications to service_role;

-- Permissão efetiva de calendário (mesmo modelo de atendhub_team_member_permissions e padrões por função).
create or replace function public.atendhub_calendar_grant(_org uuid, _action text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_role text;
  explicit_grant text;
begin
  select m.role into member_role
  from public.atendhub_team_members m
  where m.id = auth.uid() and m.organization_id = _org and m.status = 'active';
  if member_role is null then return 'none'; end if;
  if member_role = 'super_admin' then return 'all'; end if;
  select p.grant_level into explicit_grant
  from public.atendhub_team_member_permissions p
  where p.team_member_id = auth.uid() and p.organization_id = _org
    and p.permission_key = 'calendar.' || _action;
  if explicit_grant is not null then return explicit_grant; end if;
  if _action in ('view', 'create', 'edit') then
    return case member_role when 'manager' then 'team' else 'own' end;
  end if;
  return 'none';
end;
$$;

create or replace function public.atendhub_calendar_allows(
  _org uuid, _client uuid, _action text, _lead_id uuid, _created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.atendhub_has_client_access(_org, _client)
    and case public.atendhub_calendar_grant(_org, _action)
      when 'all' then true
      when 'team' then true
      when 'own' then (
        _created_by = auth.uid()
        or exists (
          select 1 from public.atendhub_leads l
          where l.id = _lead_id and l.organization_id = _org and l.owner_id = auth.uid()
        )
      )
      else false
    end;
$$;

create or replace function public.atendhub_calendar_manages(_org uuid, _client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.atendhub_has_client_access(_org, _client)
    and public.atendhub_calendar_grant(_org, 'edit') in ('team', 'all');
$$;

create or replace function public.atendhub_calendar_views(_org uuid, _client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.atendhub_has_client_access(_org, _client)
    and public.atendhub_calendar_grant(_org, 'view') <> 'none';
$$;

create policy atendhub_schedule_settings_select on public.atendhub_professional_schedule_settings
  for select to authenticated using (public.atendhub_calendar_views(organization_id, client_id));
create policy atendhub_availability_weeks_select on public.atendhub_availability_weeks
  for select to authenticated using (public.atendhub_calendar_views(organization_id, client_id));
create policy atendhub_availability_intervals_select on public.atendhub_availability_intervals
  for select to authenticated using (public.atendhub_calendar_views(organization_id, client_id));
create policy atendhub_appointments_select on public.atendhub_appointments
  for select to authenticated using (
    public.atendhub_calendar_allows(organization_id, client_id, 'view', lead_id, created_by_id)
  );
create policy atendhub_appointment_events_select on public.atendhub_appointment_events
  for select to authenticated using (public.atendhub_calendar_manages(organization_id, client_id));
create policy atendhub_appointment_notifications_select on public.atendhub_appointment_notifications
  for select to authenticated using (public.atendhub_calendar_manages(organization_id, client_id));

-- Resolve organização do cliente exigindo acesso ao cliente.
create or replace function public.atendhub_calendar_org(_client uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare org uuid;
begin
  select c.organization_id into org from public.atendhub_clients c where c.id = _client;
  if org is null or not public.atendhub_has_client_access(org, _client) then
    raise exception using errcode = '42501', message = 'CLIENT_FORBIDDEN';
  end if;
  return org;
end;
$$;

-- Salva disponibilidade semanal (substitui os intervalos da semana; agendamentos existentes não são tocados).
create or replace function public.atendhub_save_availability(
  _client uuid,
  _professional uuid,
  _week date,
  _intervals jsonb,
  _default_duration integer,
  _display_step integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := public.atendhub_calendar_org(_client);
  total integer;
begin
  if not public.atendhub_calendar_manages(org, _client) then
    raise exception using errcode = '42501', message = 'AVAILABILITY_FORBIDDEN';
  end if;
  if _week is null or extract(isodow from _week) <> 1 then
    raise exception using errcode = '22023', message = 'INVALID_WEEK';
  end if;
  if _default_duration is null or _default_duration not between 1 and 480
     or _display_step is null or _display_step not between 5 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_PREFERENCES';
  end if;
  if jsonb_typeof(_intervals) <> 'array' or jsonb_array_length(_intervals) > 700 then
    raise exception using errcode = '22023', message = 'INVALID_INTERVALS';
  end if;
  if not exists (
    select 1 from public.atendhub_professionals p
    where p.id = _professional and p.organization_id = org and p.client_id = _client
  ) then
    raise exception using errcode = 'P0002', message = 'PROFESSIONAL_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('availability:' || _professional::text, 0));

  create temporary table if not exists pg_temp.atendhub_incoming_intervals (
    day date, start_minute integer, end_minute integer
  ) on commit drop;
  truncate pg_temp.atendhub_incoming_intervals;
  insert into pg_temp.atendhub_incoming_intervals
  select x.day, x.start_minute, x.end_minute
  from jsonb_to_recordset(_intervals) as x(day date, start_minute integer, end_minute integer);

  if exists (
    select 1 from pg_temp.atendhub_incoming_intervals i
    where i.day is null or i.start_minute is null or i.end_minute is null
      or i.day < _week or i.day > _week + 6
      or i.start_minute < 0 or i.end_minute > 1440 or i.start_minute >= i.end_minute
  ) then
    raise exception using errcode = '22023', message = 'INVALID_INTERVALS';
  end if;

  insert into public.atendhub_professional_schedule_settings
    (professional_id, organization_id, client_id, default_duration, display_step, updated_by_id, updated_at)
  values (_professional, org, _client, _default_duration, _display_step, auth.uid(), now())
  on conflict (professional_id) do update
    set default_duration = excluded.default_duration,
        display_step = excluded.display_step,
        updated_by_id = excluded.updated_by_id,
        updated_at = now();

  insert into public.atendhub_availability_weeks
    (professional_id, week_start, organization_id, client_id, updated_by_id, updated_at)
  values (_professional, _week, org, _client, auth.uid(), now())
  on conflict (professional_id, week_start) do update
    set updated_by_id = excluded.updated_by_id, updated_at = now();

  delete from public.atendhub_availability_intervals
  where professional_id = _professional and week_start = _week;

  insert into public.atendhub_availability_intervals
    (organization_id, client_id, professional_id, week_start, day, start_minute, end_minute)
  select org, _client, _professional, _week, merged.day, merged.s, merged.e
  from (
    select numbered.day, min(numbered.s) as s, max(numbered.e) as e
    from (
      select flagged.*, sum(flagged.new_group) over (partition by flagged.day order by flagged.s, flagged.e) as grp
      from (
        select ordered.*,
          case when max(ordered.e) over (
            partition by ordered.day order by ordered.s, ordered.e
            rows between unbounded preceding and 1 preceding
          ) is null or ordered.s > max(ordered.e) over (
            partition by ordered.day order by ordered.s, ordered.e
            rows between unbounded preceding and 1 preceding
          ) then 1 else 0 end as new_group
        from (
          select i.day, i.start_minute as s, i.end_minute as e from pg_temp.atendhub_incoming_intervals i
        ) ordered
      ) flagged
    ) numbered
    group by numbered.day, numbered.grp
  ) merged;

  select count(*) into total from public.atendhub_availability_intervals
  where professional_id = _professional and week_start = _week;
  return jsonb_build_object('week', _week, 'intervals', total);
end;
$$;

-- Validação de intervalo reutilizada por criação e remarcação (interna).
create or replace function public.atendhub_validate_appointment_slot(
  _org uuid,
  _client uuid,
  _professional uuid,
  _starts_at timestamptz,
  _duration integer,
  _exclude uuid
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  local_start timestamp;
  local_day date;
  start_min integer;
  week date;
  ends timestamptz;
begin
  if _duration is null or _duration not between 1 and 480 then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;
  if _starts_at is null or date_trunc('minute', _starts_at) <> _starts_at then
    raise exception using errcode = '22023', message = 'INVALID_START';
  end if;
  select coalesce(
    (select s.timezone from public.atendhub_professional_schedule_settings s where s.professional_id = _professional),
    'America/Sao_Paulo'
  ) into tz;
  local_start := _starts_at at time zone tz;
  local_day := local_start::date;
  start_min := extract(hour from local_start)::integer * 60 + extract(minute from local_start)::integer;
  if start_min + _duration > 1440 then
    raise exception using errcode = '22023', message = 'CROSSES_MIDNIGHT';
  end if;
  week := local_day - (extract(isodow from local_day)::integer - 1);
  if not exists (
    select 1 from public.atendhub_availability_intervals i
    where i.professional_id = _professional and i.week_start = week and i.day = local_day
      and i.start_minute <= start_min and i.end_minute >= start_min + _duration
  ) then
    raise exception using errcode = 'P0001', message = 'OUTSIDE_AVAILABILITY';
  end if;
  ends := _starts_at + make_interval(mins => _duration);
  if exists (
    select 1 from public.atendhub_appointments a
    where a.professional_id = _professional and a.status <> 'cancelled'
      and (_exclude is null or a.id <> _exclude)
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(_starts_at, ends, '[)')
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_TAKEN';
  end if;
  return ends;
end;
$$;
revoke all on function public.atendhub_validate_appointment_slot(uuid, uuid, uuid, timestamptz, integer, uuid) from public, anon, authenticated;

create or replace function public.atendhub_appointment_json(_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(a) from public.atendhub_appointments a where a.id = _id;
$$;
revoke all on function public.atendhub_appointment_json(uuid) from public, anon, authenticated;

-- Cria agendamento (idempotente) e registra a notificação na mesma transação.
create or replace function public.atendhub_create_appointment(
  _client uuid,
  _professional uuid,
  _lead uuid,
  _starts_at timestamptz,
  _duration integer,
  _notes text,
  _idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := public.atendhub_calendar_org(_client);
  lead_owner uuid;
  prof_type text;
  prof_status text;
  existing public.atendhub_appointments;
  ends timestamptz;
  new_id uuid := gen_random_uuid();
  notification_id uuid := gen_random_uuid();
  clean_notes text := coalesce(btrim(_notes), '');
  operation_name text;
begin
  if _idempotency_key is null or char_length(_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if char_length(clean_notes) > 1000 then
    raise exception using errcode = '22023', message = 'INVALID_NOTES';
  end if;

  select p.status, p.professional_type into prof_status, prof_type
  from public.atendhub_professionals p
  where p.id = _professional and p.organization_id = org and p.client_id = _client;
  if prof_status is null then
    raise exception using errcode = 'P0002', message = 'PROFESSIONAL_NOT_FOUND';
  end if;

  select l.owner_id into lead_owner
  from public.atendhub_leads l
  where l.id = _lead and l.organization_id = org and l.client_id = _client;
  if not found then
    raise exception using errcode = 'P0002', message = 'LEAD_NOT_FOUND';
  end if;

  if not public.atendhub_calendar_allows(org, _client, 'create', _lead, auth.uid()) then
    raise exception using errcode = '42501', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('appointment:' || _professional::text, 0));

  select * into existing from public.atendhub_appointments a
  where a.organization_id = org and a.idempotency_key = _idempotency_key;
  if found then
    if existing.client_id <> _client or existing.professional_id <> _professional
       or existing.lead_id <> _lead or existing.starts_at <> _starts_at
       or existing.ends_at <> _starts_at + make_interval(mins => _duration)
       or existing.notes <> clean_notes then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'created', false,
      'appointment', to_jsonb(existing),
      'notificationId', (select n.id from public.atendhub_appointment_notifications n
        where n.appointment_id = existing.id and n.event_type = 'appointment.created')
    );
  end if;

  if prof_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'PROFESSIONAL_INACTIVE';
  end if;

  ends := public.atendhub_validate_appointment_slot(org, _client, _professional, _starts_at, _duration, null);

  begin
    insert into public.atendhub_appointments
      (id, organization_id, client_id, professional_id, lead_id, starts_at, ends_at, notes, idempotency_key, created_by_id)
    values (new_id, org, _client, _professional, _lead, _starts_at, ends, clean_notes, _idempotency_key, auth.uid());
  exception when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'SLOT_TAKEN';
  end;

  insert into public.atendhub_appointment_events
    (organization_id, client_id, appointment_id, event_type, actor_id, to_value)
  values (org, _client, new_id, 'created', auth.uid(),
    jsonb_build_object('startsAt', _starts_at, 'endsAt', ends, 'professionalId', _professional, 'leadId', _lead));

  operation_name := case prof_type when 'health' then 'healthcare' when 'legal' then 'legal' else 'other' end;
  insert into public.atendhub_appointment_notifications
    (id, organization_id, client_id, appointment_id, event_type, payload)
  values (notification_id, org, _client, new_id, 'appointment.created', jsonb_build_object(
    'id', notification_id,
    'eventType', 'appointment.created',
    'schemaVersion', 1,
    'organizationId', org,
    'clientId', _client,
    'leadId', _lead,
    'doctorId', _professional,
    'appointmentId', new_id,
    'operation', operation_name,
    'scheduledAt', _starts_at,
    'endsAt', ends,
    'timezone', 'America/Sao_Paulo',
    'occurredAt', now(),
    'status', 'pending'
  ));

  return jsonb_build_object(
    'created', true,
    'appointment', public.atendhub_appointment_json(new_id),
    'notificationId', notification_id
  );
end;
$$;

-- Remarcação: move o mesmo agendamento, liberando a ocupação anterior.
create or replace function public.atendhub_reschedule_appointment(
  _appointment uuid,
  _starts_at timestamptz,
  _duration integer,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.atendhub_appointments;
  ends timestamptz;
begin
  select * into current from public.atendhub_appointments where id = _appointment for update;
  if not found or not public.atendhub_has_client_access(current.organization_id, current.client_id) then
    raise exception using errcode = 'P0002', message = 'APPOINTMENT_NOT_FOUND';
  end if;
  if not public.atendhub_calendar_allows(current.organization_id, current.client_id, 'edit', current.lead_id, current.created_by_id) then
    raise exception using errcode = '42501', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if current.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_CANCELLED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('appointment:' || current.professional_id::text, 0));
  ends := public.atendhub_validate_appointment_slot(
    current.organization_id, current.client_id, current.professional_id, _starts_at, _duration, current.id
  );
  begin
    update public.atendhub_appointments
      set starts_at = _starts_at, ends_at = ends,
          status = 'awaiting_confirmation', attendance = 'unknown', updated_at = now()
      where id = current.id;
  exception when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'SLOT_TAKEN';
  end;
  insert into public.atendhub_appointment_events
    (organization_id, client_id, appointment_id, event_type, actor_id, from_value, to_value, reason)
  values (current.organization_id, current.client_id, current.id, 'rescheduled', auth.uid(),
    jsonb_build_object('startsAt', current.starts_at, 'endsAt', current.ends_at, 'status', current.status),
    jsonb_build_object('startsAt', _starts_at, 'endsAt', ends, 'status', 'awaiting_confirmation'),
    nullif(btrim(coalesce(_reason, '')), ''));
  return jsonb_build_object('appointment', public.atendhub_appointment_json(current.id));
end;
$$;

-- Estado: confirmar, marcar remarcação pendente, comparecimento ou cancelar (cancelar exige calendar.delete).
create or replace function public.atendhub_update_appointment_state(
  _appointment uuid,
  _status text,
  _attendance text,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.atendhub_appointments;
  next_status text;
  next_attendance text;
begin
  select * into current from public.atendhub_appointments where id = _appointment for update;
  if not found or not public.atendhub_has_client_access(current.organization_id, current.client_id) then
    raise exception using errcode = 'P0002', message = 'APPOINTMENT_NOT_FOUND';
  end if;
  next_status := coalesce(_status, current.status);
  next_attendance := coalesce(_attendance, current.attendance);
  if next_status not in ('awaiting_confirmation', 'confirmed', 'rescheduling', 'cancelled')
     or next_attendance not in ('unknown', 'present', 'absent') then
    raise exception using errcode = '22023', message = 'INVALID_STATE';
  end if;
  if current.status = 'cancelled' and (next_status <> 'cancelled' or next_attendance <> current.attendance) then
    raise exception using errcode = 'P0001', message = 'APPOINTMENT_CANCELLED';
  end if;
  if next_status = 'cancelled' and current.status <> 'cancelled' then
    if not public.atendhub_calendar_allows(current.organization_id, current.client_id, 'delete', current.lead_id, current.created_by_id) then
      raise exception using errcode = '42501', message = 'APPOINTMENT_FORBIDDEN';
    end if;
  elsif not public.atendhub_calendar_allows(current.organization_id, current.client_id, 'edit', current.lead_id, current.created_by_id) then
    raise exception using errcode = '42501', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if next_status = current.status and next_attendance = current.attendance then
    return jsonb_build_object('appointment', to_jsonb(current));
  end if;

  update public.atendhub_appointments
    set status = next_status,
        attendance = next_attendance,
        cancelled_at = case when next_status = 'cancelled' and current.status <> 'cancelled' then now() else cancelled_at end,
        cancelled_by_id = case when next_status = 'cancelled' and current.status <> 'cancelled' then auth.uid() else cancelled_by_id end,
        updated_at = now()
    where id = current.id;

  if next_status <> current.status then
    insert into public.atendhub_appointment_events
      (organization_id, client_id, appointment_id, event_type, actor_id, from_value, to_value, reason)
    values (current.organization_id, current.client_id, current.id,
      case when next_status = 'cancelled' then 'cancelled' else 'status_changed' end,
      auth.uid(), jsonb_build_object('status', current.status), jsonb_build_object('status', next_status),
      nullif(btrim(coalesce(_reason, '')), ''));
  end if;
  if next_attendance <> current.attendance then
    insert into public.atendhub_appointment_events
      (organization_id, client_id, appointment_id, event_type, actor_id, from_value, to_value)
    values (current.organization_id, current.client_id, current.id, 'attendance_changed',
      auth.uid(), jsonb_build_object('attendance', current.attendance), jsonb_build_object('attendance', next_attendance));
  end if;
  return jsonb_build_object('appointment', public.atendhub_appointment_json(current.id));
end;
$$;

revoke all on function public.atendhub_calendar_grant(uuid, text) from public, anon;
revoke all on function public.atendhub_calendar_allows(uuid, uuid, text, uuid, uuid) from public, anon;
revoke all on function public.atendhub_calendar_manages(uuid, uuid) from public, anon;
revoke all on function public.atendhub_calendar_views(uuid, uuid) from public, anon;
revoke all on function public.atendhub_calendar_org(uuid) from public, anon, authenticated;
revoke all on function public.atendhub_save_availability(uuid, uuid, date, jsonb, integer, integer) from public, anon;
revoke all on function public.atendhub_create_appointment(uuid, uuid, uuid, timestamptz, integer, text, text) from public, anon;
revoke all on function public.atendhub_reschedule_appointment(uuid, timestamptz, integer, text) from public, anon;
revoke all on function public.atendhub_update_appointment_state(uuid, text, text, text) from public, anon;
grant execute on function public.atendhub_calendar_grant(uuid, text) to authenticated;
grant execute on function public.atendhub_calendar_allows(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.atendhub_calendar_manages(uuid, uuid) to authenticated;
grant execute on function public.atendhub_calendar_views(uuid, uuid) to authenticated;
grant execute on function public.atendhub_save_availability(uuid, uuid, date, jsonb, integer, integer) to authenticated;
grant execute on function public.atendhub_create_appointment(uuid, uuid, uuid, timestamptz, integer, text, text) to authenticated;
grant execute on function public.atendhub_reschedule_appointment(uuid, timestamptz, integer, text) to authenticated;
grant execute on function public.atendhub_update_appointment_state(uuid, text, text, text) to authenticated;
