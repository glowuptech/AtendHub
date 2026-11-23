begin;

create table public.atendhub_paid_attributions (
  organization_id uuid not null,
  client_id uuid not null,
  lead_id uuid not null,
  channel text not null check(channel in ('form','whatsapp')),
  evidence text not null check(evidence in ('form_parameter','whatsapp_phrase','whatsapp_ad')),
  campaign_id text not null,
  ad_id text,
  message_id uuid references public.atendhub_inbox_messages(id) on delete set null,
  occurred_at timestamptz not null,
  primary key(organization_id,lead_id,channel),
  foreign key(lead_id,organization_id,client_id) references public.atendhub_leads(id,organization_id,client_id) on delete cascade,
  foreign key(organization_id,campaign_id) references public.atendhub_meta_campaigns on delete cascade,
  foreign key(organization_id,ad_id) references public.atendhub_meta_ads on delete set null (ad_id)
);
create index atendhub_paid_attributions_range on public.atendhub_paid_attributions(organization_id,campaign_id,occurred_at);
create table public.atendhub_paid_whatsapp_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  connection_id uuid not null,
  campaign_id text not null,
  phrase text not null check(length(phrase) between 5 and 300),
  normalized_phrase text not null,
  created_at timestamptz not null default now(),
  unique(connection_id,normalized_phrase),
  foreign key(connection_id,organization_id,client_id) references public.atendhub_whatsapp_connections(id,organization_id,client_id),
  foreign key(organization_id,campaign_id) references public.atendhub_meta_campaigns on delete cascade
);
alter table public.atendhub_paid_attributions enable row level security;
alter table public.atendhub_paid_whatsapp_rules enable row level security;
revoke all on public.atendhub_paid_attributions,public.atendhub_paid_whatsapp_rules from public,anon,authenticated,atendhub_integration;
grant select,delete on public.atendhub_paid_whatsapp_rules to service_role;
grant select on public.atendhub_paid_attributions to service_role;

create function public.atendhub_normalize_paid_phrase(p_phrase text) returns text
language sql immutable set search_path='' as $$
  select btrim(regexp_replace(lower(coalesce(p_phrase,'')),'[[:space:][:punct:]]+',' ','g'));
$$;

create function public.atendhub_save_paid_whatsapp_rule(p_org uuid,p_client uuid,p_connection uuid,p_campaign text,p_phrase text)
returns void language plpgsql security definer set search_path='' as $$
declare phrase_key text:=public.atendhub_normalize_paid_phrase(p_phrase);
begin
  if length(phrase_key)<5 or not exists(select 1 from public.atendhub_meta_campaigns
    where organization_id=p_org and client_id=p_client and campaign_id=p_campaign)
    or not exists(select 1 from public.atendhub_whatsapp_connections
      where id=p_connection and organization_id=p_org and client_id=p_client and status<>'deleted')
    then raise exception 'INVALID_PAID_RULE'; end if;
  insert into public.atendhub_paid_whatsapp_rules(organization_id,client_id,connection_id,campaign_id,phrase,normalized_phrase)
    values(p_org,p_client,p_connection,p_campaign,btrim(p_phrase),phrase_key);
end $$;
revoke all on function public.atendhub_save_paid_whatsapp_rule(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.atendhub_save_paid_whatsapp_rule(uuid,uuid,uuid,text,text) to service_role;

create function public.atendhub_attribute_form_campaign(p_org uuid,p_client uuid,p_lead uuid,p_campaign text,p_ad text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.atendhub_leads where organization_id=p_org and client_id=p_client and id=p_lead and form_id is not null)
    or not exists(select 1 from public.atendhub_meta_campaigns where organization_id=p_org and client_id=p_client and campaign_id=p_campaign)
    then return false; end if;
  insert into public.atendhub_paid_attributions(organization_id,client_id,lead_id,channel,evidence,campaign_id,ad_id,occurred_at)
    select p_org,p_client,p_lead,'form','form_parameter',p_campaign,
      (select ad_id from public.atendhub_meta_ads where organization_id=p_org and campaign_id=p_campaign and ad_id=p_ad),created_at
    from public.atendhub_leads where organization_id=p_org and client_id=p_client and id=p_lead
  on conflict(organization_id,lead_id,channel) do nothing;
  return found;
end $$;
revoke all on function public.atendhub_attribute_form_campaign(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.atendhub_attribute_form_campaign(uuid,uuid,uuid,text,text) to service_role;

-- The n8n integration can associate an actual provider ad ID after ingesting an
-- inbound message. No contact data or raw referral payload is stored here.
create function public.atendhub_attribute_whatsapp_campaign(p_message uuid,p_ad text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare m public.atendhub_inbox_messages; c public.atendhub_inbox_conversations; campaign text; proof text;
begin
  select * into m from public.atendhub_inbox_messages where id=p_message and direction='inbound' and origin='contact';
  if not found then return false; end if;
  select * into strict c from public.atendhub_inbox_conversations where id=m.conversation_id;
  if exists(select 1 from public.atendhub_inbox_messages earlier
    join public.atendhub_inbox_conversations episode on episode.id=earlier.conversation_id
    where episode.lead_id=c.lead_id and episode.organization_id=c.organization_id
      and earlier.direction='inbound' and earlier.id<>m.id
      and (earlier.recorded_at,earlier.id)<(m.recorded_at,m.id))
    then return false; end if;
  if p_ad is not null then
    select ca.campaign_id into campaign from public.atendhub_meta_ads ad
      join public.atendhub_meta_campaigns ca using(organization_id,campaign_id)
      where ad.organization_id=c.organization_id and ca.client_id=c.client_id and ad.ad_id=p_ad;
    if campaign is null then return false; end if;
    proof:='whatsapp_ad';
  else
    select rule.campaign_id into campaign from public.atendhub_paid_whatsapp_rules rule
      join public.atendhub_meta_campaigns ca using(organization_id,campaign_id)
      where rule.organization_id=c.organization_id and rule.client_id=c.client_id and ca.client_id=c.client_id
        and rule.connection_id=c.connection_id and rule.normalized_phrase=public.atendhub_normalize_paid_phrase(m.body)
        and m.message_type='text';
    if campaign is null then return false; end if;
    proof:='whatsapp_phrase';
  end if;
  insert into public.atendhub_paid_attributions(organization_id,client_id,lead_id,channel,evidence,campaign_id,ad_id,message_id,occurred_at)
    values(c.organization_id,c.client_id,c.lead_id,'whatsapp',proof,campaign,p_ad,m.id,m.occurred_at)
  on conflict(organization_id,lead_id,channel) do update set evidence=excluded.evidence,campaign_id=excluded.campaign_id,ad_id=excluded.ad_id
    where atendhub_paid_attributions.evidence='whatsapp_phrase' and excluded.evidence='whatsapp_ad'
      and atendhub_paid_attributions.message_id=excluded.message_id;
  return found;
end $$;
revoke all on function public.atendhub_attribute_whatsapp_campaign(uuid,text) from public,anon,authenticated;
grant execute on function public.atendhub_attribute_whatsapp_campaign(uuid,text) to service_role,atendhub_integration;

create function public.atendhub_auto_attribute_whatsapp() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.atendhub_attribute_whatsapp_campaign(new.id);
  return new;
end $$;
revoke all on function public.atendhub_auto_attribute_whatsapp() from public,anon,authenticated;
create trigger atendhub_auto_attribute_whatsapp after insert on public.atendhub_inbox_messages
  for each row when (new.direction='inbound' and new.message_type='text')
  execute function public.atendhub_auto_attribute_whatsapp();
commit;
