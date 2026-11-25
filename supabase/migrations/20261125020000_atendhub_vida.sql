create or replace function public.atendhub_meta_classify(p_org uuid,p_account text) returns void
language sql set search_path='' as $$
  update public.atendhub_meta_campaigns campaign
  set client_id=coalesce(campaign.client_id,(
    select link.client_id from public.atendhub_meta_account_clients link
    join public.atendhub_meta_accounts a using(organization_id,account_id)
    join public.atendhub_meta_client_codes codes using(organization_id,client_id)
    where link.organization_id=p_org and link.account_id=p_account
      and (not a.shared or codes.code=(regexp_match(upper(campaign.name),'^\[([A-Z0-9]+)\]'))[1])
  ))),
  stage=coalesce(campaign.stage,(select case token when 'VIS' then 'ATR' when 'AGE' then 'ACA' else token end from regexp_matches(upper(campaign.name),'^(?:\[[A-Z0-9]+\])?\[(VIS|ATR|INT|DES|AGE|ACA)\]') as m(parts) cross join lateral unnest(m.parts) as t(token)))
  where campaign.organization_id=p_org and campaign.account_id=p_account and not campaign.manual;
$$;
