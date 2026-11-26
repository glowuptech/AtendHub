-- Keep the published snapshot and its public slug available while an editor saves a draft.
create or replace function public.atendhub_save_form_version(
  p_org uuid, p_client uuid, p_form uuid, p_create boolean, p_details jsonb,
  p_version jsonb, p_fields jsonb, p_publish boolean, p_expected_update timestamptz
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  f public.atendhub_forms%rowtype;
  v public.atendhub_form_versions%rowtype;
  version_id uuid := (p_version->>'id')::uuid;
  version_number integer := (p_version->>'number')::integer;
  version_state public.atendhub_form_versions.state%type;
  definition_json jsonb;
  assets jsonb;
begin
  if not exists (select 1 from public.atendhub_team_members where id = auth.uid() and organization_id = p_org and status = 'active')
     or not exists (select 1 from public.atendhub_clients where id = p_client and organization_id = p_org)
  then raise insufficient_privilege; end if;
  if p_create then
    insert into public.atendhub_forms (id, organization_id, client_id, doctor_id, name, description, slug, status)
      values (p_form, p_org, p_client, (p_details->>'doctorId')::uuid, p_details->>'name',
        coalesce(p_details->>'description',''), p_details->>'slug', 'draft');
  end if;
  select * into strict f from public.atendhub_forms where id = p_form and client_id = p_client and organization_id = p_org for update;
  if f.status = 'archived' or (p_expected_update is not null and f.updated_at <> p_expected_update) then
    raise serialization_failure;
  end if;
  select * into v from public.atendhub_form_versions where form_id = p_form order by number desc limit 1;
  if v.id is null and version_number <> 1 or
     v.state = 'draft' and (v.id <> version_id or v.number <> version_number) or
     v.state = 'snapshot' and (v.id = version_id or version_number <> v.number + 1)
  then raise serialization_failure; end if;
  version_state := case when p_publish then 'snapshot' else 'draft' end;
  definition_json := jsonb_build_object('version', p_version || jsonb_build_object(
    'formId', p_form, 'clientId', p_client, 'organizationId', p_org, 'state', version_state),
    'fields', p_fields, 'details', p_details);
  select coalesce(jsonb_agg(jsonb_build_object('id', opt->>'id','imageUrl',opt->>'imageUrl','alt',opt->>'alt')), '[]')
    into assets from jsonb_array_elements(p_fields) field, jsonb_array_elements(field->'options') opt
    where coalesce(opt->>'imageUrl','') <> '';
  if v.state = 'draft' then
    update public.atendhub_form_versions set state = version_state, definition = definition_json,
      paths = p_version->'paths', choice_assets = assets where id = v.id and state = 'draft';
    if not found then raise serialization_failure; end if;
  else
    insert into public.atendhub_form_versions (id, form_id, organization_id, client_id, number, state, definition, paths, choice_assets, created_by_id)
    values (version_id, p_form, p_org, p_client, version_number, version_state, definition_json, p_version->'paths', assets, auth.uid());
  end if;
  if p_publish or f.status <> 'demo' then
    update public.atendhub_forms set name = p_details->>'name', slug = p_details->>'slug',
      description = coalesce(p_details->>'description',''), doctor_id = (p_details->>'doctorId')::uuid,
      active_version_id = version_id, status = case when p_publish then 'demo' else 'draft' end,
      updated_at = clock_timestamp() where id = p_form returning * into strict f;
  else
    update public.atendhub_forms set updated_at = clock_timestamp() where id = p_form returning * into strict f;
  end if;
  return jsonb_build_object('form', to_jsonb(f), 'versions', (select jsonb_agg(to_jsonb(ver) order by number)
    from public.atendhub_form_versions ver where form_id = p_form));
end;
$$;
revoke all on function public.atendhub_save_form_version(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb,boolean,timestamptz) from public, anon;
grant execute on function public.atendhub_save_form_version(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb,boolean,timestamptz) to authenticated;

-- The public HTTP handler validates and filters the answers before this service-only write.
-- Partial and final submissions for the same visit share a key and commit with their answers.
create or replace function public.atendhub_capture_form_answers(
  p_form uuid, p_version uuid, p_key text, p_contacts jsonb, p_responses jsonb, p_complete boolean
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  f public.atendhub_forms%rowtype;
  l public.atendhub_leads%rowtype;
  values_json jsonb;
  capture_state public.atendhub_leads.capture_status%type;
  contact_name text;
  next_action_text text;
begin
  select * into strict f from public.atendhub_forms
    where id = p_form and active_version_id = p_version and status = 'demo' for share;
  perform pg_advisory_xact_lock(hashtextextended(p_form::text || ':' || p_key, 0));
  select * into l from public.atendhub_leads where form_id = f.id and idempotency_key = p_key for update;
  if l.id is not null and l.form_version_id is distinct from p_version then raise serialization_failure; end if;
  if l.capture_status = 'completed' then return l.id; end if;
  select coalesce(jsonb_agg(jsonb_build_object('question_id', r->'question_id', 'value', r->'value')), '[]')
    into values_json from jsonb_array_elements(p_responses) r;
  capture_state := case when p_complete then 'completed' else 'in_progress' end;
  next_action_text := case when p_complete then 'Iniciar atendimento' else 'Aguardando conclusão do formulário' end;
  contact_name := coalesce(nullif(p_contacts->>'name',''), nullif(p_contacts->>'email',''), nullif(p_contacts->>'phone',''), 'Contato sem identificação');
  if l.id is null then
    insert into public.atendhub_leads (organization_id,client_id,professional_id,name,phone,email,source,
      capture_status,stage,form_id,form_version_id,origin_submission_id,field_values,idempotency_key,original_captured_at,next_action)
    values (f.organization_id,f.client_id,f.doctor_id,contact_name,p_contacts->>'phone',p_contacts->>'email',f.name,
      capture_state,'new',f.id,p_version,gen_random_uuid(),values_json,p_key,now(),next_action_text) returning * into l;
  else
    update public.atendhub_leads set name = contact_name, phone = p_contacts->>'phone', email = p_contacts->>'email',
      capture_status = capture_state, field_values = values_json, next_action = next_action_text where id = l.id;
  end if;
  delete from public.atendhub_lead_responses old where old.lead_id = l.id and old.form_version_id = p_version
    and not exists (select from jsonb_array_elements(p_responses) r where r->>'question_id' = old.question_id::text);
  insert into public.atendhub_lead_responses (organization_id,client_id,lead_id,form_id,form_version_id,question_id,question_snapshot,value)
    select f.organization_id,f.client_id,l.id,f.id,p_version,(r->>'question_id')::uuid,r->'question_snapshot',r->'value'
    from jsonb_array_elements(p_responses) r
    on conflict (lead_id,question_id) do update set value = excluded.value, question_snapshot = excluded.question_snapshot;
  return l.id;
end;
$$;
revoke all on function public.atendhub_capture_form_answers(uuid,uuid,text,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.atendhub_capture_form_answers(uuid,uuid,text,jsonb,jsonb,boolean) to service_role;
