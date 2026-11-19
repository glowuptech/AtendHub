-- Manual, consolidated advertising expenditure. This is not service revenue,
-- payment, client monthly fee or an automatic import from an ad platform.
begin;
create table public.atendhub_daily_investments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 client_id uuid not null,
 day date not null,
 amount_cents bigint not null check (amount_cents between 0 and 100000000000),
 currency text not null default 'BRL' check (currency = 'BRL'),
 notes text not null default '' check (char_length(notes) <= 500),
 created_by_id uuid not null references auth.users(id),
 updated_by_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (client_id, organization_id) references public.atendhub_clients(id, organization_id),
 unique (organization_id, client_id, day)
);
create index atendhub_daily_investments_period_idx on public.atendhub_daily_investments(organization_id, day, client_id);
alter table public.atendhub_daily_investments enable row level security;
revoke all on public.atendhub_daily_investments from public, anon, authenticated;
grant select on public.atendhub_daily_investments to authenticated;
grant all on public.atendhub_daily_investments to service_role;
create policy atendhub_daily_investments_read on public.atendhub_daily_investments
 for select to authenticated using (public.atendhub_is_active_member(organization_id) and public.atendhub_has_client_access(organization_id,client_id));

create function public.atendhub_save_daily_investment(_org uuid, _client uuid, _day date, _amount bigint, _notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists (select 1 from public.atendhub_team_members m where m.id=auth.uid() and m.organization_id=_org and m.status='active' and m.role='super_admin')
  or not public.atendhub_has_client_access(_org,_client) then
  raise insufficient_privilege using message='FORBIDDEN';
 end if;
 if not exists(select 1 from public.atendhub_clients c where c.id=_client and c.organization_id=_org) then raise insufficient_privilege using message='CLIENT_FORBIDDEN'; end if;
 insert into public.atendhub_daily_investments(organization_id,client_id,day,amount_cents,notes,created_by_id,updated_by_id)
 values(_org,_client,_day,_amount,coalesce(_notes,''),auth.uid(),auth.uid())
 on conflict(organization_id,client_id,day) do update set amount_cents=excluded.amount_cents,notes=excluded.notes,updated_by_id=auth.uid(),updated_at=pg_catalog.now();
end $$;
create function public.atendhub_remove_daily_investment(_org uuid, _client uuid, _day date)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists (select 1 from public.atendhub_team_members m where m.id=auth.uid() and m.organization_id=_org and m.status='active' and m.role='super_admin')
  or not public.atendhub_has_client_access(_org,_client) then
  raise insufficient_privilege using message='FORBIDDEN';
 end if;
 delete from public.atendhub_daily_investments where organization_id=_org and client_id=_client and day=_day;
end $$;
revoke all on function public.atendhub_save_daily_investment(uuid,uuid,date,bigint,text) from public,anon,service_role;
revoke all on function public.atendhub_remove_daily_investment(uuid,uuid,date) from public,anon,service_role;
grant execute on function public.atendhub_save_daily_investment(uuid,uuid,date,bigint,text) to authenticated;
grant execute on function public.atendhub_remove_daily_investment(uuid,uuid,date) to authenticated;
commit;
