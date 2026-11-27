begin;
alter table public.atendhub_production_approvals
  add column notified_at timestamptz,
  add column notify_after timestamptz not null default now(),
  add column notify_attempts integer not null default 0;
create index production_approval_notifications_due on public.atendhub_production_approvals(notify_after)
  where status='pending' and notified_at is null;

-- Reserve only current versions with a configured destination and a live portal.
create function public.atendhub_claim_approval_notifications(p_task uuid default null)
returns table(id uuid, task_id uuid, title text, organization_id uuid, client_id uuid,
  requested_at timestamptz, slug text, destination text, attempt integer)
language sql set search_path='' as $$
  with candidates as (
    select a.id, t.organization_id, t.client_id, t.title, d.slug, w.config->>'productionApprovals' as destination
    from public.atendhub_production_approvals a
    join public.atendhub_production_tasks t on t.id=a.task_id
    join public.atendhub_client_domains d on d.client_id=t.client_id and d.organization_id=t.organization_id and d.active
    join public.atendhub_webhook_settings w on w.organization_id=t.organization_id
    where a.status='pending' and t.stage='approval' and a.notified_at is null and a.notify_after<=now()
      and (p_task is null or t.id=p_task) and nullif(w.config->>'productionApprovals','') is not null
    order by a.notify_after,a.id limit 20 for update of a skip locked
  )
  update public.atendhub_production_approvals a set notify_attempts=a.notify_attempts+1,
    notify_after=now()+interval '2 minutes'
  from candidates c where c.id=a.id
  returning a.id,a.task_id,c.title,c.organization_id,c.client_id,a.requested_at,c.slug,c.destination,a.notify_attempts;
$$;
revoke all on function public.atendhub_claim_approval_notifications(uuid) from public,anon,authenticated;
grant execute on function public.atendhub_claim_approval_notifications(uuid) to service_role;
commit;
