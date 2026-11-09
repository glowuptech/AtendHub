-- Hardening exclusivo dos objetos atendhub_. Não altera auth.users nem objetos legados.
create or replace function public.atendhub_guard_super_admin_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text, 0));
  if old.role = 'super_admin' and (tg_op = 'DELETE' or new.role <> 'super_admin' or new.status <> 'active') then
    if not exists (
      select 1 from public.atendhub_team_members m
      where m.organization_id = old.organization_id
        and m.id <> old.id
        and m.role = 'super_admin'
        and m.status = 'active'
    ) then
      raise exception 'A organização precisa manter um superadministrador ativo';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop policy if exists atendhub_team_members_update on public.atendhub_team_members;
create policy atendhub_team_members_update
on public.atendhub_team_members for update to authenticated
using (atendhub_is_super_admin(organization_id) and id <> auth.uid())
with check (atendhub_is_super_admin(organization_id) and id <> auth.uid());

revoke all on function public.atendhub_is_active_member(uuid) from public;
revoke all on function public.atendhub_is_super_admin(uuid) from public;
revoke all on function public.atendhub_has_client_access(uuid, uuid) from public;
revoke all on function public.atendhub_guard_super_admin_membership() from public;
grant execute on function public.atendhub_is_active_member(uuid) to authenticated;
grant execute on function public.atendhub_is_super_admin(uuid) to authenticated;
grant execute on function public.atendhub_has_client_access(uuid, uuid) to authenticated;
