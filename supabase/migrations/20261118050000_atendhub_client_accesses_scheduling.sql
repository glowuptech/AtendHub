begin;
create table public.atendhub_client_accesses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 client_id uuid not null, label text not null check(length(trim(label)) between 2 and 120),
 url text not null default '', login text not null check(length(login) between 1 and 240),
 notes text not null default '' check(length(notes)<=1000), encrypted_password jsonb not null,
 created_by_id uuid references auth.users(id), created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(client_id,organization_id) references public.atendhub_clients(id,organization_id) on delete cascade,
 check(jsonb_typeof(encrypted_password)='object' and encrypted_password->>'version'='1' and encrypted_password ?& array['version','iv','tag','data'])
);
create index atendhub_client_accesses_client_idx on public.atendhub_client_accesses(organization_id,client_id);
alter table public.atendhub_client_accesses enable row level security;
revoke all on public.atendhub_client_accesses from public,anon,authenticated;
grant select,insert,update,delete on public.atendhub_client_accesses to service_role;
create function public.atendhub_update_external_scheduling(p_client_id uuid,p_name text,p_url text)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.atendhub_team_members where id=auth.uid() and status='active' and role='super_admin';
 if org is null or not public.atendhub_has_client_access(org,p_client_id) then raise insufficient_privilege using message='FORBIDDEN'; end if;
 if p_name is null or p_url is null or length(p_name)>120 or length(p_url)>2000 or (p_url<>'' and p_url !~ '^https://') then raise exception 'INVALID_SCHEDULING'; end if;
 update public.atendhub_clients set metadata=coalesce(metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object('externalSchedulingName',p_name,'externalSchedulingUrl',p_url),updated_at=pg_catalog.now() where id=p_client_id and organization_id=org;
 if not found then raise exception 'CLIENT_NOT_FOUND'; end if;
end $$;
revoke all on function public.atendhub_update_external_scheduling(uuid,text,text) from public,anon,service_role;
grant execute on function public.atendhub_update_external_scheduling(uuid,text,text) to authenticated;
commit;
