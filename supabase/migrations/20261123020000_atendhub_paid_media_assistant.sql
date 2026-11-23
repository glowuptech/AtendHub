begin;
create table public.atendhub_paid_media_exchanges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  mode text not null check(mode in ('analyze','generate','improve')),
  stage text check(stage in ('ATR','INT','DES','ACA')),
  question text not null,
  status text not null default 'pending' check(status in ('pending','answered','failed')),
  answer jsonb,
  created_at timestamptz not null default now(),
  foreign key(client_id,organization_id) references public.atendhub_clients(id,organization_id),
  unique(organization_id,actor_id,request_id)
);
create index atendhub_paid_media_exchanges_client on public.atendhub_paid_media_exchanges(organization_id,client_id,actor_id,created_at desc);
alter table public.atendhub_paid_media_exchanges enable row level security;
revoke all on public.atendhub_paid_media_exchanges from public,anon,authenticated,atendhub_integration;
grant select,insert,update on public.atendhub_paid_media_exchanges to service_role;
commit;
