begin;
create extension if not exists pg_cron;

-- A visit can leave the contact screen without ever pressing Continue.
create table public.atendhub_pending_form_contacts (
  form_id uuid not null references public.atendhub_forms(id) on delete cascade,
  version_id uuid not null references public.atendhub_form_versions(id) on delete cascade,
  submission_key text not null,
  contact_name text not null,
  phone text not null,
  sequence_no integer not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (form_id, submission_key)
);
alter table public.atendhub_pending_form_contacts enable row level security;
revoke all on public.atendhub_pending_form_contacts from public,anon,authenticated;
grant select,insert,update,delete on public.atendhub_pending_form_contacts to service_role;

create function public.atendhub_checkpoint_form_contact(p_form uuid,p_version uuid,p_key text,p_name text,p_phone text,p_sequence integer)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
  perform 1 from atendhub_forms where id=p_form and active_version_id=p_version and status='demo' for share;
  if not found then raise exception 'Inactive version'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_form::text||':'||p_key,0));
  if exists(select 1 from atendhub_leads where form_id=p_form and idempotency_key=p_key) then return; end if;
  insert into atendhub_pending_form_contacts as c(form_id,version_id,submission_key,contact_name,phone,sequence_no)
    values(p_form,p_version,p_key,p_name,p_phone,p_sequence)
    on conflict(form_id,submission_key) do update set contact_name=excluded.contact_name,phone=excluded.phone,
      sequence_no=excluded.sequence_no,last_seen=now() where excluded.sequence_no>c.sequence_no and c.version_id=excluded.version_id;
end $$;

alter table public.atendhub_leads add column form_progress_at timestamptz;
create function public.atendhub_stamp_form_progress() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.form_id is not null and new.idempotency_key is not null and new.created_by_id is null
    and has_table_privilege(current_user,'public.atendhub_pending_form_contacts','DELETE') then
    new.form_progress_at:=now();
    delete from atendhub_pending_form_contacts where form_id=new.form_id and submission_key=new.idempotency_key;
  end if;
  return new;
end $$;
create trigger stamp_form_progress before insert or update of field_values on public.atendhub_leads
  for each row execute function public.atendhub_stamp_form_progress();

create function public.atendhub_form_idle_timeout(definition jsonb) returns interval
language sql immutable as $$
  select make_interval(mins=>case when definition #>> '{version,settings,tracking,abandonMinutes}' ~ '^[0-9]{1,4}$'
    then greatest(1,least(1440,(definition #>> '{version,settings,tracking,abandonMinutes}')::integer)) else 30 end);
$$;

create function public.atendhub_recover_incomplete_forms() returns integer
language plpgsql set search_path=public,pg_temp as $$
declare c record; inserted integer:=0; changed integer;
begin
  -- Legacy submissions already have a CRM identity. Keep assignment, stage and answers.
  with due as (
    select l.id from atendhub_leads l join atendhub_form_versions v on v.id=l.form_version_id and v.form_id=l.form_id
    where l.capture_status='in_progress' and l.idempotency_key is not null and l.created_by_id is null
      and l.origin_submission_id is not null and v.state='snapshot'
      and v.definition #>> '{version,settings,contactPosition}'='start'
      and nullif(trim(l.name),'') is not null and nullif(trim(l.phone),'') is not null
      and coalesce(l.form_progress_at,l.updated_at,l.original_captured_at,l.created_at)+atendhub_form_idle_timeout(v.definition)<=now()
    order by l.id limit 1000 for update of l skip locked
  )
  update atendhub_leads l set capture_status='incomplete',next_action=case when l.next_action='Aguardando conclusão do formulário'
    then 'Retomar cadastro incompleto' else l.next_action end from due where l.id=due.id;
  get diagnostics changed=row_count;

  for c in select p.form_id,p.submission_key from atendhub_pending_form_contacts p join atendhub_form_versions v on v.id=p.version_id
    where p.last_seen+atendhub_form_idle_timeout(v.definition)<=now() order by p.last_seen limit 500 loop
    -- Match the lock order of the normal submission path and recheck after acquiring it.
    if not pg_try_advisory_xact_lock(hashtextextended(c.form_id::text||':'||c.submission_key,0)) then continue; end if;
    insert into atendhub_leads(organization_id,client_id,professional_id,name,phone,email,source,capture_status,stage,
      form_id,form_version_id,origin_submission_id,field_values,idempotency_key,original_captured_at,next_action)
      select f.organization_id,f.client_id,f.doctor_id,p.contact_name,p.phone,'',f.name,'incomplete','new',
        f.id,v.id,gen_random_uuid(),'[]'::jsonb,p.submission_key,p.first_seen,'Retomar cadastro incompleto'
      from atendhub_pending_form_contacts p join atendhub_forms f on f.id=p.form_id
      join atendhub_form_versions v on v.id=p.version_id and v.form_id=f.id
      where p.form_id=c.form_id and p.submission_key=c.submission_key
        and p.last_seen+atendhub_form_idle_timeout(v.definition)<=now()
      on conflict(form_id,idempotency_key) where idempotency_key is not null do nothing;
    if found then inserted:=inserted+1; end if;
  end loop;
  return changed+inserted;
end $$;
revoke all on function public.atendhub_checkpoint_form_contact(uuid,uuid,text,text,text,integer),public.atendhub_recover_incomplete_forms() from public,anon,authenticated;
grant execute on function public.atendhub_checkpoint_form_contact(uuid,uuid,text,text,text,integer),public.atendhub_recover_incomplete_forms() to service_role;
select public.atendhub_recover_incomplete_forms();
select cron.schedule('atendhub-recover-incomplete-forms','* * * * *','select public.atendhub_recover_incomplete_forms()');
commit;
