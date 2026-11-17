begin;
create table public.atendhub_webhook_settings (
 organization_id uuid primary key references public.atendhub_organizations(id),
 config jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table public.atendhub_whatsapp_connections (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.atendhub_organizations(id),
 client_id uuid not null,
 name text not null,
 instance_name text not null unique,
 phone text not null check (phone ~ '^55[1-9][0-9]{9,10}$'),
 status text not null default 'awaiting_confirmation' check(status in ('awaiting_confirmation','confirming','updating','delete_pending','connected','disconnected','error','deleted')),
 last_event_id uuid,
 created_by_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,organization_id),
 foreign key(client_id,organization_id) references public.atendhub_clients(id,organization_id)
);
create table public.atendhub_whatsapp_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.atendhub_organizations(id),
 connection_id uuid not null,
 request_id uuid not null,
 event_type text not null,
 payload jsonb not null,
 delivery_status text not null default 'pending' check(delivery_status in ('pending','delivered','retry')),
 attempts integer not null default 0, result_status text,
 created_at timestamptz not null default now(), delivered_at timestamptz,
 unique(organization_id,request_id),
 foreign key(connection_id,organization_id) references public.atendhub_whatsapp_connections(id,organization_id)
);
create index atendhub_whatsapp_client_idx on public.atendhub_whatsapp_connections(organization_id,client_id);
create index atendhub_whatsapp_events_connection_idx on public.atendhub_whatsapp_events(connection_id,created_at);
alter table public.atendhub_webhook_settings enable row level security;
alter table public.atendhub_whatsapp_connections enable row level security;
alter table public.atendhub_whatsapp_events enable row level security;
-- Manage integrations is initially restricted to active super administrators.
create policy atendhub_webhook_admin on public.atendhub_webhook_settings for all to authenticated using(exists(select 1 from public.atendhub_team_members t where t.id=auth.uid() and t.organization_id=atendhub_webhook_settings.organization_id and t.role='super_admin' and t.status='active')) with check(exists(select 1 from public.atendhub_team_members t where t.id=auth.uid() and t.organization_id=atendhub_webhook_settings.organization_id and t.role='super_admin' and t.status='active'));
create policy atendhub_whatsapp_admin on public.atendhub_whatsapp_connections for select to authenticated using(exists(select 1 from public.atendhub_team_members t where t.id=auth.uid() and t.organization_id=atendhub_whatsapp_connections.organization_id and t.role='super_admin' and t.status='active'));
create policy atendhub_whatsapp_event_admin on public.atendhub_whatsapp_events for select to authenticated using(exists(select 1 from public.atendhub_team_members t where t.id=auth.uid() and t.organization_id=atendhub_whatsapp_events.organization_id and t.role='super_admin' and t.status='active'));
revoke all on public.atendhub_webhook_settings,public.atendhub_whatsapp_connections,public.atendhub_whatsapp_events from anon,authenticated;
grant select,insert,update on public.atendhub_webhook_settings to authenticated;
grant select,update on public.atendhub_whatsapp_events to service_role;
grant select on public.atendhub_whatsapp_connections,public.atendhub_whatsapp_events to authenticated;
-- Mutations only through the narrow transactional function; org and actor come from auth.uid().
create function public.atendhub_whatsapp_command(p_action text,p_request_id uuid,p_connection_id uuid default null,p_client_id uuid default null,p_name text default null,p_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; c public.atendhub_whatsapp_connections; ev public.atendhub_whatsapp_events; client public.atendhub_clients; prefix text; eid uuid:=gen_random_uuid(); kind text;
begin
 select organization_id into org from public.atendhub_team_members where id=auth.uid() and status='active' and role='super_admin';
 if org is null then raise insufficient_privilege using message='WHATSAPP_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||p_request_id::text,0));
 select * into ev from public.atendhub_whatsapp_events where organization_id=org and request_id=p_request_id;
 if found then
  if ev.event_type <> 'whatsapp.connection.'||p_action||'_requested' then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if p_action='create' and (ev.payload#>>'{client,id}' is distinct from p_client_id::text or ev.payload#>>'{connection,name}' is distinct from trim(p_name) or ev.payload#>>'{connection,phone}' is distinct from p_phone) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if p_action<>'create' and ev.connection_id is distinct from p_connection_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('eventId',ev.id,'connectionId',ev.connection_id);
 end if;
 if p_action='create' then
  select * into client from public.atendhub_clients where id=p_client_id and organization_id=org;
  if not found then raise exception 'CLIENT_NOT_FOUND'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 60 then raise exception 'INVALID_NAME'; end if;
  prefix:=trim(both '-' from regexp_replace(lower(translate(client.name||'-'||trim(p_name),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')),'[^a-z0-9]+','-','g'));
  if length(prefix)<2 then raise exception 'INVALID_INSTANCE_NAME'; end if;
  insert into public.atendhub_whatsapp_connections(organization_id,client_id,name,instance_name,phone,created_by_id) values(org,client.id,trim(p_name),prefix,p_phone,auth.uid()) returning * into c;
 else
  select * into c from public.atendhub_whatsapp_connections where id=p_connection_id and organization_id=org for update;
  if not found or c.status='deleted' then raise exception 'CONNECTION_NOT_FOUND'; end if;
  if p_action not in ('confirm','update','delete') then raise exception 'INVALID_ACTION'; end if;
  if c.last_event_id is not null and exists(select 1 from public.atendhub_whatsapp_events where id=c.last_event_id and delivery_status<>'delivered') then raise exception 'EVENT_NOT_DELIVERED'; end if;
  if c.status in ('confirming','updating','delete_pending') and p_action<>'delete' then raise exception 'ACTION_PENDING'; end if;
  update public.atendhub_whatsapp_connections set phone=case when p_action='update' then p_phone else phone end,status=case p_action when 'confirm' then 'confirming' when 'update' then 'updating' else 'delete_pending' end,updated_at=now() where id=c.id returning * into c;
 end if;
 select * into client from public.atendhub_clients where id=c.client_id and organization_id=org;
 kind:='whatsapp.connection.'||p_action||'_requested';
 insert into public.atendhub_whatsapp_events(id,organization_id,connection_id,request_id,event_type,payload) values(eid,org,c.id,p_request_id,kind,jsonb_build_object('id',eid,'schemaVersion',1,'eventType',kind,'occurredAt',now(),'organizationId',org,'actorId',auth.uid(),'client',jsonb_build_object('id',client.id,'name',client.name,'operationId',client.operation_id),'connection',jsonb_build_object('id',c.id,'instanceName',c.instance_name,'name',c.name,'phone',c.phone)));
 update public.atendhub_whatsapp_connections set last_event_id=eid where id=c.id;
 return jsonb_build_object('eventId',eid,'connectionId',c.id);
end $$;
revoke all on function public.atendhub_whatsapp_command(text,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.atendhub_whatsapp_command(text,uuid,uuid,uuid,text,text) to authenticated;
-- Callback is only invoked by the server after verifying the n8n HMAC.
create function public.atendhub_whatsapp_callback(p_connection_id uuid,p_event_id uuid,p_status text) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.atendhub_whatsapp_connections; ev public.atendhub_whatsapp_events;
begin
 select * into c from public.atendhub_whatsapp_connections where id=p_connection_id for update;
 if not found or c.last_event_id is distinct from p_event_id then return false; end if;
 select * into ev from public.atendhub_whatsapp_events where id=p_event_id and connection_id=c.id;
 if not found then return false; end if;
 if ev.result_status is not null then return ev.result_status=p_status; end if;
 if p_status not in ('connected','disconnected','error','deleted','awaiting_confirmation') then raise exception 'INVALID_STATUS'; end if;
 if p_status='deleted' and ev.event_type<>'whatsapp.connection.delete_requested' then raise exception 'INVALID_TRANSITION'; end if;
 if p_status='connected' and ev.event_type not in ('whatsapp.connection.confirm_requested','whatsapp.connection.update_requested') then raise exception 'CONFIRM_REQUIRED'; end if;
 if c.status='deleted' then return p_status='deleted'; end if;
 update public.atendhub_whatsapp_events set result_status=p_status where id=p_event_id;
 update public.atendhub_whatsapp_connections set status=p_status,updated_at=now() where id=c.id;
 return true;
end $$;
revoke all on function public.atendhub_whatsapp_callback(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.atendhub_whatsapp_callback(uuid,uuid,text) to service_role;
commit;
