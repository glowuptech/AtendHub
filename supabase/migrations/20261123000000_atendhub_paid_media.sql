begin;

create table public.atendhub_meta_accounts (
  organization_id uuid not null,
  account_id text not null check(account_id ~ '^act_[0-9]{1,30}$'),
  name text not null,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  timezone text not null,
  shared boolean not null,
  primary key(organization_id,account_id)
);
create table public.atendhub_meta_account_clients (
  organization_id uuid not null,
  account_id text not null,
  client_id uuid not null,
  primary key(organization_id,account_id,client_id),
  foreign key(organization_id,account_id) references public.atendhub_meta_accounts on delete cascade,
  foreign key(client_id,organization_id) references public.atendhub_clients(id,organization_id)
);
create table public.atendhub_meta_client_codes (
  organization_id uuid not null,
  client_id uuid not null,
  code text not null default ('C'||upper(left(replace(gen_random_uuid()::text,'-',''),10))),
  primary key(organization_id,client_id),
  unique(organization_id,code),
  foreign key(client_id,organization_id) references public.atendhub_clients(id,organization_id)
);
create table public.atendhub_meta_campaigns (
  organization_id uuid not null,
  account_id text not null,
  campaign_id text not null check(campaign_id ~ '^[0-9]{1,30}$'),
  name text not null,
  client_id uuid,
  stage text check(stage in ('ATR','INT','DES','ACA')),
  manual boolean not null default false,
  primary key(organization_id,campaign_id),
  foreign key(organization_id,account_id) references public.atendhub_meta_accounts on delete cascade,
  foreign key(organization_id,account_id,client_id) references public.atendhub_meta_account_clients on delete restrict
);
create index atendhub_meta_campaign_account_idx on public.atendhub_meta_campaigns(organization_id,account_id);
create table public.atendhub_meta_ads (
  organization_id uuid not null,
  ad_id text not null check(ad_id ~ '^[0-9]{1,30}$'),
  campaign_id text not null,
  name text not null,
  creative_id text,
  thumbnail text,
  copy text,
  primary key(organization_id,ad_id),
  foreign key(organization_id,campaign_id) references public.atendhub_meta_campaigns on delete cascade
);
create table public.atendhub_meta_ad_insights (
  organization_id uuid not null,
  ad_id text not null,
  day date not null,
  spend numeric(18,6) not null check(spend>=0),
  impressions bigint not null check(impressions>=0),
  form_leads bigint check(form_leads>=0),
  whatsapp_conversations bigint check(whatsapp_conversations>=0),
  profile_visits bigint check(profile_visits>=0),
  thruplays bigint check(thruplays>=0),
  primary key(organization_id,ad_id,day),
  foreign key(organization_id,ad_id) references public.atendhub_meta_ads on delete cascade
);
create index atendhub_meta_insights_day_idx on public.atendhub_meta_ad_insights(organization_id,day);
create table public.atendhub_meta_sync_days (
  organization_id uuid not null,
  account_id text not null,
  day date not null,
  imported_at timestamptz not null,
  primary key(organization_id,account_id,day),
  foreign key(organization_id,account_id) references public.atendhub_meta_accounts on delete cascade
);

create table public.atendhub_campaign_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  name text not null,
  starts_on date not null,
  ends_on date not null check(ends_on>=starts_on),
  objective text not null default '',
  service text not null default '',
  audience text not null default '',
  stages jsonb not null check(jsonb_typeof(stages)='object'),
  status text not null default 'draft' check(status in ('draft','approved','archived')),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  foreign key(client_id,organization_id) references public.atendhub_clients(id,organization_id)
);
create index atendhub_campaign_plans_scope on public.atendhub_campaign_plans(organization_id,client_id,updated_at desc);

-- These tables are accessed through scoped server routes. Raw ad rows and pending
-- attribution from shared accounts are never exposed directly through PostgREST.
do $$
declare table_name text;
begin
  foreach table_name in array array['atendhub_meta_accounts','atendhub_meta_account_clients','atendhub_meta_client_codes',
    'atendhub_meta_campaigns','atendhub_meta_ads','atendhub_meta_ad_insights','atendhub_meta_sync_days','atendhub_campaign_plans'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select,insert,update,delete on public.%I to service_role',table_name);
  end loop;
end $$;

-- Resolve campaigns by stable client code and AIDA prefix. Keep an existing mapping
-- across provider renames. Explicit corrections will be preserved by later imports.
create function public.atendhub_meta_classify(p_org uuid,p_account text) returns void
language sql set search_path='' as $$
  update public.atendhub_meta_campaigns campaign
  set client_id=coalesce(campaign.client_id,(
    select link.client_id from public.atendhub_meta_account_clients link
    join public.atendhub_meta_accounts a using(organization_id,account_id)
    join public.atendhub_meta_client_codes codes using(organization_id,client_id)
    where link.organization_id=p_org and link.account_id=p_account
      and (not a.shared or codes.code=(regexp_match(upper(campaign.name),'^\[([A-Z0-9]+)\]'))[1])
  )),
  stage=coalesce(campaign.stage,(regexp_match(upper(campaign.name),'^(?:\[[A-Z0-9]+\])?\[(ATR|INT|DES|ACA)\]'))[1])
  where campaign.organization_id=p_org and campaign.account_id=p_account and not campaign.manual;
$$;
revoke all on function public.atendhub_meta_classify(uuid,text) from public,anon,authenticated;
grant execute on function public.atendhub_meta_classify(uuid,text) to service_role;

-- Lock the account for configuration changes and sync publication.
create function public.atendhub_meta_link(p_org uuid,p_account text,p_client uuid,p_mode text,
  p_name text default null,p_currency text default null,p_timezone text default null)
returns void language plpgsql set search_path='' as $$
declare current_mode boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('meta:'||p_org::text||':'||p_account,0));
  select shared into current_mode from public.atendhub_meta_accounts where organization_id=p_org and account_id=p_account;
  if p_mode='remove' then
    update public.atendhub_meta_campaigns set client_id=null,manual=false
      where organization_id=p_org and account_id=p_account and client_id=p_client;
    delete from public.atendhub_meta_account_clients where organization_id=p_org and account_id=p_account and client_id=p_client;
    return;
  end if;
  if p_mode not in ('shared','exclusive') or p_mode is null then raise exception 'INVALID_MODE'; end if;
  if exists(select 1 from public.atendhub_meta_account_clients where organization_id=p_org and account_id=p_account and client_id<>p_client)
      and (p_mode='exclusive' or current_mode=false) then raise exception 'ACCOUNT_MODE_CONFLICT'; end if;
  insert into public.atendhub_meta_accounts(organization_id,account_id,name,currency,timezone,shared)
    values(p_org,p_account,p_name,p_currency,p_timezone,p_mode='shared')
    on conflict(organization_id,account_id) do update set shared=excluded.shared,name=excluded.name,timezone=excluded.timezone
    where atendhub_meta_accounts.currency=excluded.currency;
  if not found then raise exception 'ACCOUNT_CURRENCY_CHANGED'; end if;
  insert into public.atendhub_meta_client_codes(organization_id,client_id) values(p_org,p_client) on conflict(organization_id,client_id) do nothing;
  insert into public.atendhub_meta_account_clients values(p_org,p_account,p_client) on conflict do nothing;
  if current_mode=false and p_mode='shared' then
    update public.atendhub_meta_campaigns set client_id=null
      where organization_id=p_org and account_id=p_account and not manual;
  end if;
  perform public.atendhub_meta_classify(p_org,p_account);
end $$;
revoke all on function public.atendhub_meta_link(uuid,text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.atendhub_meta_link(uuid,text,uuid,text,text,text,text) to service_role;

create function public.atendhub_meta_import(p_org uuid,p_account text,p_from date,p_to date,p_started timestamptz,
  p_campaigns jsonb,p_ads jsonb,p_insights jsonb)
returns boolean language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('meta:'||p_org::text||':'||p_account,0));
  if not exists(select 1 from public.atendhub_meta_account_clients where organization_id=p_org and account_id=p_account) then raise exception 'ACCOUNT_NOT_LINKED'; end if;
  if p_to<p_from or p_to-p_from>=31 then raise exception 'INVALID_RANGE'; end if;
  if exists(select 1 from public.atendhub_meta_sync_days where organization_id=p_org and account_id=p_account and day between p_from and p_to and imported_at>p_started)
    then return false; end if;
  if exists(select 1 from jsonb_to_recordset(p_campaigns) p(campaign_id text)
      join public.atendhub_meta_campaigns c using(campaign_id)
      where c.organization_id=p_org and c.account_id<>p_account) then raise exception 'CAMPAIGN_ACCOUNT_CONFLICT'; end if;

  insert into public.atendhub_meta_campaigns(organization_id,account_id,campaign_id,name)
    select p_org,p_account,campaign_id,name from jsonb_to_recordset(p_campaigns) p(campaign_id text,name text)
    on conflict(organization_id,campaign_id) do update set name=excluded.name;
  perform public.atendhub_meta_classify(p_org,p_account);

  if exists(select 1 from jsonb_to_recordset(p_ads) p(ad_id text,campaign_id text)
      left join public.atendhub_meta_campaigns c on c.organization_id=p_org and c.campaign_id=p.campaign_id and c.account_id=p_account
      left join public.atendhub_meta_ads a on a.organization_id=p_org and a.ad_id=p.ad_id
      where c.campaign_id is null or (a.ad_id is not null and a.campaign_id<>p.campaign_id))
    then raise exception 'AD_CAMPAIGN_CONFLICT'; end if;
  insert into public.atendhub_meta_ads(organization_id,ad_id,campaign_id,name,creative_id,thumbnail,copy)
    select p_org,ad_id,campaign_id,name,creative_id,thumbnail,copy
    from jsonb_to_recordset(p_ads) p(ad_id text,campaign_id text,name text,creative_id text,thumbnail text,copy text)
    on conflict(organization_id,ad_id) do update set name=excluded.name,
      creative_id=coalesce(excluded.creative_id,atendhub_meta_ads.creative_id),
      thumbnail=coalesce(excluded.thumbnail,atendhub_meta_ads.thumbnail),copy=coalesce(excluded.copy,atendhub_meta_ads.copy);

  if exists(select 1 from jsonb_to_recordset(p_insights) p(ad_id text,day date)
      left join public.atendhub_meta_ads a on a.organization_id=p_org and a.ad_id=p.ad_id
      left join public.atendhub_meta_campaigns c on c.organization_id=p_org and c.campaign_id=a.campaign_id and c.account_id=p_account
      where c.campaign_id is null or p.day not between p_from and p_to)
    then raise exception 'INVALID_INSIGHT_SCOPE'; end if;
  delete from public.atendhub_meta_ad_insights i using public.atendhub_meta_ads ad, public.atendhub_meta_campaigns ca
    where i.organization_id=p_org and i.day between p_from and p_to
      and ad.organization_id=p_org and ad.ad_id=i.ad_id and ca.organization_id=p_org and ca.campaign_id=ad.campaign_id and ca.account_id=p_account;
  insert into public.atendhub_meta_ad_insights
    select p_org,ad_id,day,spend,impressions,form_leads,whatsapp_conversations,profile_visits,thruplays
    from jsonb_to_recordset(p_insights) p(ad_id text,day date,spend numeric,impressions bigint,
      form_leads bigint,whatsapp_conversations bigint,profile_visits bigint,thruplays bigint);
  insert into public.atendhub_meta_sync_days
    select p_org,p_account,p_from+n,p_started from generate_series(0,p_to-p_from) n
    on conflict(organization_id,account_id,day) do update set imported_at=excluded.imported_at;
  return true;
end $$;
revoke all on function public.atendhub_meta_import(uuid,text,date,date,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.atendhub_meta_import(uuid,text,date,date,timestamptz,jsonb,jsonb,jsonb) to service_role;
commit;
