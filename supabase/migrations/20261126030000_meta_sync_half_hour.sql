-- Allow a completed account to run in the next half-hour scheduling window.
create or replace function public.atendhub_meta_auto_sync_claim(p_org uuid, p_limit integer)
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
          and a.auto_sync_started_at < date_bin(
            interval '30 minutes', statement_timestamp(), timestamptz '2000-01-01 00:00:00+00'
          )
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
