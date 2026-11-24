begin;
create extension if not exists pgcrypto with schema extensions;
alter table public.atendhub_appointments add column idempotency_fingerprint bytea;
update public.atendhub_appointments
set idempotency_fingerprint = extensions.digest(convert_to(idempotency_payload::text, 'UTF8'), 'sha256')
where idempotency_payload is not null;
alter table public.atendhub_appointments drop column idempotency_payload;

create or replace function public.atendhub_create_appointment_with_details(
  _client uuid,
  _professional uuid,
  _lead uuid,
  _starts_at timestamptz,
  _duration integer,
  _notes text,
  _idempotency_key text,
  _conversation uuid,
  _personal_data jsonb,
  _service jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := public.atendhub_calendar_org(_client);
  prof_type text;
  prof_status text;
  existing public.atendhub_appointments;
  ends timestamptz;
  new_id uuid := gen_random_uuid();
  notification_id uuid := gen_random_uuid();
  clean_notes text := coalesce(btrim(_notes), '');
  operation_name text;
  request_identity jsonb;
  request_fingerprint bytea;
  value_row public.atendhub_service_values;
  full_name_value text;
  cpf_value text;
  rg_value text;
  birth_value text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED'; end if;
  if _idempotency_key is null or char_length(_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if char_length(clean_notes) > 1000 then raise exception using errcode = '22023', message = 'INVALID_NOTES'; end if;
  if _personal_data is not null then
    if jsonb_typeof(_personal_data) <> 'object'
       or jsonb_typeof(_personal_data->'fullName') <> 'string'
       or jsonb_typeof(_personal_data->'cpf') <> 'string'
       or jsonb_typeof(_personal_data->'rg') <> 'string'
       or jsonb_typeof(_personal_data->'birthDate') <> 'string' then
      raise exception using errcode = '22023', message = 'INVALID_PERSONAL_DATA';
    end if;
    full_name_value := nullif(btrim(_personal_data->>'fullName'), '');
    cpf_value := nullif(regexp_replace(_personal_data->>'cpf', '[^0-9]', '', 'g'), '');
    rg_value := nullif(btrim(_personal_data->>'rg'), '');
    birth_value := nullif(btrim(_personal_data->>'birthDate'), '');
    if char_length(coalesce(full_name_value,'')) > 160 or (full_name_value is not null and char_length(full_name_value) < 2)
       or char_length(coalesce(rg_value,'')) > 30 then
      raise exception using errcode = '22023', message = 'INVALID_PERSONAL_DATA';
    end if;
    if cpf_value is not null and not public.atendhub_valid_cpf(cpf_value) then
      raise exception using errcode = '22023', message = 'INVALID_CPF';
    end if;
    if birth_value is not null and (birth_value !~ '^\d{4}-\d{2}-\d{2}$' or birth_value::date > (now() at time zone 'America/Sao_Paulo')::date) then
      raise exception using errcode = '22023', message = 'INVALID_BIRTH_DATE';
    end if;
  end if;
  if _service is not null and (
    jsonb_typeof(_service) <> 'object'
    or jsonb_typeof(_service->'description') <> 'string'
    or jsonb_typeof(_service->'currency') <> 'string'
    or _service->>'currency' <> 'BRL'
    or char_length(btrim(_service->>'description')) not between 2 and 160
    or (_service ? 'amountCents' and jsonb_typeof(_service->'amountCents') not in ('number','null'))
    or coalesce((_service->>'amountCents')::numeric < 0, false)
    or coalesce((_service->>'amountCents')::numeric > 100000000000, false)
    or coalesce((_service->>'amountCents')::numeric <> trunc((_service->>'amountCents')::numeric), false)
  ) then raise exception using errcode = '22023', message = 'INVALID_SERVICE'; end if;
  request_identity := jsonb_build_object(
    'clientId',_client,'professionalId',_professional,'leadId',_lead,'startsAt',_starts_at,
    'duration',_duration,'notes',clean_notes,'conversationId',_conversation,
    'personalData',_personal_data,'service',_service
  );
  request_fingerprint := extensions.digest(convert_to(request_identity::text, 'UTF8'), 'sha256');

  select p.status, p.professional_type into prof_status, prof_type
  from public.atendhub_professionals p
  where p.id = _professional and p.organization_id = org and p.client_id = _client;
  if prof_status is null then raise exception using errcode = 'P0002', message = 'PROFESSIONAL_NOT_FOUND'; end if;
  if not exists (select 1 from public.atendhub_leads l where l.id = _lead and l.organization_id = org and l.client_id = _client) then
    raise exception using errcode = 'P0002', message = 'LEAD_NOT_FOUND';
  end if;
  if not public.atendhub_calendar_allows(org, _client, 'create', _lead, auth.uid()) then
    raise exception using errcode = '42501', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if _conversation is not null and not exists (
    select 1 from public.atendhub_inbox_conversations c
    where c.id = _conversation and c.organization_id = org and c.client_id = _client and c.lead_id = _lead
  ) then raise exception using errcode = '42501', message = 'CONVERSATION_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('appointment:' || _professional::text, 0));
  select * into existing from public.atendhub_appointments a
  where a.organization_id = org and a.idempotency_key = _idempotency_key for update;
  if found then
    if existing.client_id <> _client or existing.professional_id <> _professional or existing.lead_id <> _lead
       or existing.starts_at <> _starts_at or existing.ends_at <> _starts_at + make_interval(mins => _duration)
       or existing.notes <> clean_notes or existing.idempotency_fingerprint is distinct from request_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('created',false,'appointment',to_jsonb(existing),'bookingDetailsSaved',true,
      'notificationId',(select n.id from public.atendhub_appointment_notifications n where n.appointment_id=existing.id and n.event_type='appointment.created'));
  end if;
  if prof_status <> 'active' then raise exception using errcode = 'P0001', message = 'PROFESSIONAL_INACTIVE'; end if;
  ends := public.atendhub_validate_appointment_slot(org,_client,_professional,_starts_at,_duration,null);
  begin
    insert into public.atendhub_appointments
      (id,organization_id,client_id,professional_id,lead_id,starts_at,ends_at,notes,idempotency_key,idempotency_fingerprint,created_by_id)
    values (new_id,org,_client,_professional,_lead,_starts_at,ends,clean_notes,_idempotency_key,request_fingerprint,auth.uid());
  exception when exclusion_violation then raise exception using errcode = 'P0001', message = 'SLOT_TAKEN'; end;

  if _personal_data is not null then
    insert into public.atendhub_lead_registration
      (lead_id,organization_id,client_id,full_name,cpf,rg,birth_date,updated_by_id,updated_at)
    values (_lead,org,_client,full_name_value,cpf_value,rg_value,birth_value::date,auth.uid(),now())
    on conflict (lead_id) do update set
      full_name=excluded.full_name,cpf=excluded.cpf,rg=excluded.rg,birth_date=excluded.birth_date,
      updated_by_id=auth.uid(),updated_at=now();
  end if;

  if _service is not null or _conversation is not null then
    select * into value_row from public.atendhub_service_values v
    where v.conversation_id = _conversation and v.appointment_id is null
    order by v.updated_at desc limit 1 for update;
    if found then
      update public.atendhub_service_values set
        appointment_id=new_id,
        description=case when _service is null then description else btrim(_service->>'description') end,
        amount_cents=case when _service is null then amount_cents else (_service->>'amountCents')::bigint end,
        currency=case when _service is null then currency else _service->>'currency' end,
        updated_at=now()
      where id=value_row.id;
    elsif _service is not null then
      insert into public.atendhub_service_values
        (organization_id,client_id,lead_id,conversation_id,appointment_id,description,amount_cents,currency,created_by_id)
      values (org,_client,_lead,_conversation,new_id,btrim(_service->>'description'),(_service->>'amountCents')::bigint,_service->>'currency',auth.uid());
    end if;
  end if;

  insert into public.atendhub_appointment_events
    (organization_id,client_id,appointment_id,event_type,actor_id,to_value)
  values (org,_client,new_id,'created',auth.uid(),jsonb_build_object('startsAt',_starts_at,'endsAt',ends,'professionalId',_professional,'leadId',_lead));
  operation_name := case prof_type when 'health' then 'healthcare' when 'legal' then 'legal' else 'other' end;
  insert into public.atendhub_appointment_notifications (id,organization_id,client_id,appointment_id,event_type,payload)
  values (notification_id,org,_client,new_id,'appointment.created',jsonb_build_object(
    'id',notification_id,'eventType','appointment.created','schemaVersion',1,'organizationId',org,
    'clientId',_client,'leadId',_lead,'doctorId',_professional,'appointmentId',new_id,
    'operation',operation_name,'scheduledAt',_starts_at,'endsAt',ends,'timezone','America/Sao_Paulo','occurredAt',now(),'status','pending'));
  return jsonb_build_object('created',true,'appointment',public.atendhub_appointment_json(new_id),
    'bookingDetailsSaved',true,'notificationId',notification_id);
end;
$$;
commit;
