begin;

alter table public.atendhub_meta_accounts
  add column auto_sync_started_at timestamptz,
  add column auto_sync_finished_at timestamptz,
  add column auto_sync_error text;

-- Claim each account once per UTC day. An interrupted claim can be recovered
-- after six minutes. A completed attempt (including a failure) waits for the next day.
create function public.atendhub_meta_auto_sync_claim(p_org uuid, p_limit integer)
returns table(account_id text, timezone text, started_at timestamptz)
language sql set search_path='' as $$
  with eligible as (
    select a.account_id
    from public.atendhub_meta_accounts a
    where a.organization_id = p_org
      and exists (
        select 1 from public.atendhub_meta_account_clients l
        where l.organization_id = p_org and l.account_id = a.account_id
      )
      and (
        a.auto_sync_started_at is null
        or (
          a.auto_sync_finished_at is not null
          and (a.auto_sync_started_at at time zone 'UTC')::date
            < (statement_timestamp() at time zone 'UTC')::date
        )
        or (
          a.auto_sync_finished_at is null
          and a.auto_sync_started_at < statement_timestamp() - interval '6 minutes'
        )
      )
    order by a.auto_sync_started_at nulls first, a.account_id
    limit greatest(1, least(p_limit, 4))
    for update of a skip locked
  )
  update public.atendhub_meta_accounts a
  set auto_sync_started_at = statement_timestamp(),
      auto_sync_finished_at = null,
      auto_sync_error = null
  from eligible
  where a.organization_id = p_org and a.account_id = eligible.account_id
  returning a.account_id, a.timezone, a.auto_sync_started_at;
$$;

create function public.atendhub_meta_auto_sync_finish(
  p_org uuid, p_account text, p_started timestamptz, p_error text
) returns boolean language plpgsql set search_path='' as $$
begin
  update public.atendhub_meta_accounts
  set auto_sync_finished_at = statement_timestamp(),
      auto_sync_error = nullif(left(p_error, 300), '')
  where organization_id = p_org and account_id = p_account
    and auto_sync_started_at = p_started and auto_sync_finished_at is null;
  return found;
end;
$$;

revoke all on function public.atendhub_meta_auto_sync_claim(uuid, integer) from public, anon, authenticated;
revoke all on function public.atendhub_meta_auto_sync_finish(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.atendhub_meta_auto_sync_claim(uuid, integer) to service_role;
grant execute on function public.atendhub_meta_auto_sync_finish(uuid, text, timestamptz, text) to service_role;

commit;
