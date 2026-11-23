begin;

create table public.atendhub_meta_credentials (
  organization_id uuid primary key references public.atendhub_organizations(id) on delete cascade,
  encrypted_token jsonb not null check (jsonb_typeof(encrypted_token) = 'object'),
  api_version text not null check (api_version ~ '^v[0-9]{1,3}\.[0-9]{1,3}$'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.atendhub_meta_credentials enable row level security;
revoke all on public.atendhub_meta_credentials from public, anon, authenticated, atendhub_integration;
grant select, insert, update on public.atendhub_meta_credentials to service_role;

commit;
