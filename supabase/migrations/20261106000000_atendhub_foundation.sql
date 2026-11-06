-- Atend&Hub foundation. This migration intentionally creates only atendhub_* objects.
create table public.atendhub_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.atendhub_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.atendhub_organizations(id) on delete cascade,
  code text not null check (code in ('prescrita', 'veredite')),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code)
);

create table public.atendhub_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.atendhub_organizations(id) on delete cascade,
  operation_id uuid not null,
  name text not null check (char_length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (operation_id, organization_id) references public.atendhub_operations(id, organization_id) on delete restrict
);

create table public.atendhub_professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.atendhub_organizations(id) on delete cascade,
  client_id uuid not null,
  name text not null check (char_length(trim(name)) > 0),
  professional_type text not null default 'other' check (professional_type in ('health', 'legal', 'other')),
  crm text,
  specialties text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id) references public.atendhub_clients(id, organization_id) on delete cascade
);

create table public.atendhub_team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.atendhub_organizations(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) > 0),
  role text not null check (role in ('attendant', 'manager', 'super_admin')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  client_access_mode text not null default 'selected' check (client_access_mode in ('all', 'selected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.atendhub_team_client_access (
  team_member_id uuid not null,
  organization_id uuid not null,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_member_id, client_id),
  foreign key (team_member_id, organization_id) references public.atendhub_team_members(id, organization_id) on delete cascade,
  foreign key (client_id, organization_id) references public.atendhub_clients(id, organization_id) on delete cascade
);

create table public.atendhub_team_member_permissions (
  team_member_id uuid not null,
  organization_id uuid not null,
  permission_key text not null check (permission_key ~ '^[a-z_]+\\.[a-z_]+$'),
  grant_level text not null check (grant_level in ('none', 'own', 'team', 'all')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_member_id, permission_key),
  foreign key (team_member_id, organization_id) references public.atendhub_team_members(id, organization_id) on delete cascade
);

create index atendhub_operations_organization_id_idx on public.atendhub_operations(organization_id);
create index atendhub_clients_organization_operation_idx on public.atendhub_clients(organization_id, operation_id);
create index atendhub_professionals_client_id_idx on public.atendhub_professionals(client_id);
create index atendhub_team_members_organization_id_idx on public.atendhub_team_members(organization_id);
create index atendhub_team_client_access_client_id_idx on public.atendhub_team_client_access(client_id);
create index atendhub_team_member_permissions_organization_id_idx on public.atendhub_team_member_permissions(organization_id);

alter table public.atendhub_organizations enable row level security;
alter table public.atendhub_operations enable row level security;
alter table public.atendhub_clients enable row level security;
alter table public.atendhub_professionals enable row level security;
alter table public.atendhub_team_members enable row level security;
alter table public.atendhub_team_client_access enable row level security;
alter table public.atendhub_team_member_permissions enable row level security;
