begin;
create table public.atendhub_client_domains (
  client_id uuid primary key,
  organization_id uuid not null,
  slug text not null unique check(slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    and slug not in ('painel','www','api','app','auth','admin','mail','status','assets')),
  active boolean not null default false,
  foreign key(client_id,organization_id) references public.atendhub_clients(id,organization_id) on delete cascade
);
alter table public.atendhub_client_domains enable row level security;
revoke all on public.atendhub_client_domains from public,anon,authenticated,atendhub_integration;
grant select,insert,update on public.atendhub_client_domains to service_role;
create or replace function public.atendhub_eve_claim(p_client uuid,p_instance text,p_public_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reserved jsonb; body text; origin text:=rtrim(trim(p_public_origin),'/');
begin
  if origin is null or origin !~ '^https://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$'
      or length(origin)>253 then raise exception 'INVALID_PUBLIC_ORIGIN'; end if;
  reserved:=public.atendhub_eve_claim(p_client,p_instance);
  if reserved is null or reserved->>'purpose'<>'confirmation' then return reserved; end if;
  origin:=coalesce((select 'https://'||domain.slug||'.atendehub.app' from public.atendhub_client_domains domain
    where domain.client_id=p_client and domain.active),origin);
  -- Keep the same text if a reservation has already been handed to the provider.
  update public.atendhub_eve_reminders r set outbound_body=
    'Olá! Aqui é a equipe de '||left(regexp_replace(cli.name,'[[:cntrl:]]',' ','g'),150)||'.'
    ||chr(10)||'Sua consulta com '||left(regexp_replace(p.name,'[[:cntrl:]]',' ','g'),150)
    ||' está marcada para '||to_char(a.starts_at at time zone a.timezone,'DD/MM/YYYY às HH24:MI')||'.'
    ||chr(10)||'Confirme ou avise se não puder comparecer até '
    ||to_char((a.starts_at-interval '30 minutes') at time zone a.timezone,'DD/MM às HH24:MI')||':'
    ||chr(10)||origin||'/confirmar/'||r.public_token::text
  from public.atendhub_appointments a
  join public.atendhub_clients cli on cli.id=a.client_id and cli.organization_id=a.organization_id
  join public.atendhub_professionals p on p.id=a.professional_id and p.organization_id=a.organization_id and p.client_id=a.client_id
  where r.id=(reserved->>'requestId')::uuid and a.id=r.appointment_id and r.slot=1
    and r.outbound_body is null and r.first_attempt_at=now()
    and a.starts_at>now()+interval '30 minutes'
  returning r.outbound_body into body;
  if body is null then return reserved; end if;
  return reserved||jsonb_build_object('body',body,'replyText',null,'confirmationUrl',origin||'/confirmar/'||right(body,36));
end $$;
drop function public.atendhub_confirmation_public(uuid,text);
create function public.atendhub_confirmation_public(p_token uuid,p_decision text default null,p_client uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.atendhub_appointments; r public.atendhub_eve_reminders; state text; clinic text;
begin
  select ap.* into a from public.atendhub_appointments ap join public.atendhub_eve_reminders e on e.appointment_id=ap.id
    where e.public_token=p_token and e.slot=1 and (p_client is null or ap.client_id=p_client) for update of ap;
  if not found then return null; end if;
  select * into r from public.atendhub_eve_reminders where public_token=p_token for update;
  if a.starts_at<>r.starts_at or a.status='cancelled' then return null; end if;
  if r.declined_at is not null and a.status='rescheduling' then
    state:='declined';
  elsif r.invalidated_at is not null or a.status not in ('awaiting_confirmation','confirmed') then
    return null;
  elsif exists(select 1 from public.atendhub_eve_reminders e where e.appointment_id=a.id
    and e.invalidated_at is null and e.confirmed_at is not null) then
    state:='confirmed';
  elsif now()>=a.starts_at-interval '30 minutes' then
    state:='expired';
  elsif p_decision='confirm' then
    perform public.atendhub_eve_finish(r.id,now(),'link',null,null);
    state:='confirmed';
  elsif p_decision='decline' then
    update public.atendhub_eve_reminders set declined_at=now() where id=r.id;
    -- The existing agenda status blocks reminders and retains the slot.
    update public.atendhub_appointments set status='rescheduling',updated_at=now() where id=a.id;
    state:='declined';
  elsif p_decision is null then
    state:='pending';
  else
    raise exception 'INVALID_DECISION';
  end if;
  select name into clinic from public.atendhub_clients where id=a.client_id and organization_id=a.organization_id;
  return jsonb_build_object('state',state,'clinic',clinic,
    'when',to_char(a.starts_at at time zone a.timezone,'DD/MM/YYYY às HH24:MI'),
    'deadline',to_char((a.starts_at-interval '30 minutes') at time zone a.timezone,'DD/MM/YYYY às HH24:MI'));
end $$;
revoke all on function public.atendhub_confirmation_public(uuid,text,uuid) from public,anon,authenticated,atendhub_integration;
grant execute on function public.atendhub_confirmation_public(uuid,text,uuid) to service_role;
create function public.atendhub_confirmation_share(p_org uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare token uuid; host text;
begin
  token:=public.atendhub_confirmation_link(p_org,p_id);
  if token is null then return null; end if;
  select 'https://'||d.slug||'.atendehub.app' into host
    from public.atendhub_eve_reminders r join public.atendhub_appointments a on a.id=r.appointment_id
    join public.atendhub_client_domains d on d.client_id=a.client_id and d.organization_id=a.organization_id
    where r.id=p_id and d.active;
  return jsonb_build_object('path',coalesce(host,'https://atendehub.app')||'/confirmar/'||token::text);
end $$;
revoke all on function public.atendhub_confirmation_share(uuid,uuid) from public,anon;
grant execute on function public.atendhub_confirmation_share(uuid,uuid) to authenticated;
commit;
