begin;
create unique index atendhub_campaign_plan_identity on public.atendhub_campaign_plans(id,client_id,organization_id);
create table public.atendhub_production_tasks (
  id uuid primary key,
  organization_id uuid not null,
  client_id uuid not null,
  plan_id uuid,
  vida text check (vida in ('ATR','INT','DES','ACA')),
  title text not null check (length(trim(title)) between 1 and 180),
  brief text not null default '',
  kind text not null check (kind in ('art','video')),
  stage text not null,
  priority text not null check(priority in ('normal','high','urgent')),
  review_on date,
  launch_on date,
  owner_id uuid references public.atendhub_team_members(id),
  created_by uuid not null references public.atendhub_team_members(id),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  check(review_on is null or launch_on is null or review_on <= launch_on),
  check(stage in ('review','approval','implementation','done') or
    (kind='art' and stage in ('brief','design')) or (kind='video' and stage in ('script','record','edit'))),
  foreign key(client_id,organization_id) references public.atendhub_clients(id,organization_id),
  foreign key(plan_id,client_id,organization_id) references public.atendhub_campaign_plans(id,client_id,organization_id)
);
create index atendhub_production_by_client on public.atendhub_production_tasks(organization_id,client_id,created_at desc);
alter table public.atendhub_production_tasks enable row level security;
revoke all on public.atendhub_production_tasks from public,anon,authenticated;
grant select,insert,update on public.atendhub_production_tasks to service_role;
commit;
