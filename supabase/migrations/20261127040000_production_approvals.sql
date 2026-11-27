begin;
create table public.atendhub_production_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.atendhub_production_tasks(id),
  file_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','changes','withdrawn')),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  feedback text
);
create index production_approval_history on public.atendhub_production_approvals(task_id, requested_at desc);
create unique index production_pending_approval on public.atendhub_production_approvals(task_id) where status='pending';
alter table public.atendhub_production_approvals enable row level security;
revoke all on public.atendhub_production_approvals from public, anon, authenticated;
grant select,insert,update on public.atendhub_production_approvals to service_role;

create function public.atendhub_production_approval(p_task uuid, p_client uuid, p_org uuid, p_actor uuid, p_action text,
  p_file text default null, p_approval uuid default null, p_feedback text default null)
returns void language plpgsql set search_path = public as $$
declare t atendhub_production_tasks%rowtype;
begin
  select * into strict t from atendhub_production_tasks where id=p_task and client_id=p_client and organization_id=p_org for update;
  if p_action='request' then
    if t.stage not in ('review','approval') or p_file is null or p_file !~ '^[0-9]{13}-[0-9a-f-]{36}-[a-zA-Z0-9_.-]+$'
      or not exists(select 1 from storage.objects where bucket_id='production-files' and name=concat_ws('/',p_org,p_client,p_task,p_file))
      then raise exception 'Invalid review file or stage'; end if;
    update atendhub_production_approvals set status='withdrawn' where task_id=t.id and status='pending';
    insert into atendhub_production_approvals(task_id,file_name,requested_by) values(t.id,p_file,p_actor);
    update atendhub_production_tasks set stage='approval',revision=revision+1 where id=t.id;
  elsif p_action in ('approved','changes') and t.stage='approval' then
    if p_action='changes' and coalesce(length(trim(p_feedback)),0)=0 then raise exception 'Feedback required'; end if;
    update atendhub_production_approvals set status=p_action, decided_by=p_actor, decided_at=now(), feedback=left(trim(p_feedback),2000)
      where task_id=t.id and id=p_approval and status='pending';
    if not found then raise exception 'Stale approval'; end if;
    update atendhub_production_tasks set stage=case when p_action='approved' then 'implementation' when kind='video' then 'edit' else 'design' end,
      revision=revision+1 where id=t.id;
  else raise exception 'Invalid decision'; end if;
end $$;
revoke all on function public.atendhub_production_approval(uuid,uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.atendhub_production_approval(uuid,uuid,uuid,uuid,text,text,uuid,text) to service_role;

create function public.atendhub_withdraw_production_approval() returns trigger language plpgsql set search_path=public as $$
begin
  update atendhub_production_approvals set status='withdrawn' where task_id=new.id and status='pending';
  return new;
end $$;
create trigger withdraw_production_approval after update of stage on public.atendhub_production_tasks
for each row when (old.stage='approval' and new.stage<>'approval') execute function public.atendhub_withdraw_production_approval();
commit;
