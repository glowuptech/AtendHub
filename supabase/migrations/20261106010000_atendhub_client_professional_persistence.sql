alter table public.atendhub_clients add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists atendhub_organizations_name_lower_uidx on public.atendhub_organizations (lower(name));
create unique index if not exists atendhub_operations_org_code_uidx on public.atendhub_operations (organization_id, code);
create unique index if not exists atendhub_clients_org_name_uidx on public.atendhub_clients (organization_id, lower(name));
create unique index if not exists atendhub_professionals_client_name_uidx on public.atendhub_professionals (client_id, lower(name));

alter policy atendhub_clients_select on public.atendhub_clients using (public.atendhub_is_active_member(organization_id) and (public.atendhub_is_super_admin(organization_id) or public.atendhub_has_client_access(organization_id, id)));
alter policy atendhub_clients_insert on public.atendhub_clients with check (public.atendhub_is_active_member(organization_id) and public.atendhub_is_super_admin(organization_id));
alter policy atendhub_clients_update on public.atendhub_clients using (public.atendhub_is_active_member(organization_id) and public.atendhub_is_super_admin(organization_id)) with check (public.atendhub_is_active_member(organization_id) and public.atendhub_is_super_admin(organization_id));
alter policy atendhub_clients_delete on public.atendhub_clients using (public.atendhub_is_active_member(organization_id) and public.atendhub_is_super_admin(organization_id));
alter policy atendhub_professionals_select on public.atendhub_professionals using (public.atendhub_is_active_member(organization_id) and (public.atendhub_is_super_admin(organization_id) or public.atendhub_has_client_access(organization_id, client_id)));
alter policy atendhub_professionals_write on public.atendhub_professionals using (public.atendhub_is_active_member(organization_id) and public.atendhub_is_super_admin(organization_id)) with check (public.atendhub_is_active_member(organization_id) and public.atendhub_is_super_admin(organization_id));

insert into public.atendhub_operations (organization_id, code, name, status)
select o.id, v.code, v.name, 'active'
from public.atendhub_organizations o
cross join (values ('prescrita','Prescrita'), ('veredite','Veredite')) as v(code, name)
where lower(o.name) = lower('GlowUp')
on conflict (organization_id, code) do update set name = excluded.name, status = 'active', updated_at = now();
