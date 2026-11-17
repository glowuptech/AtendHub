begin;
-- Explicit user action opens an empty conversation; never creates messages or sends events.
create function public.atendhub_inbox_start_conversation(p_lead_id uuid,p_connection_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare l public.atendhub_leads; c public.atendhub_whatsapp_connections; v_phone text; locked_phone text; existing public.atendhub_inbox_conversations; result_id uuid;
begin
 if auth.uid() is null then raise insufficient_privilege using message='INBOX_START_FORBIDDEN'; end if;
 select * into l from public.atendhub_leads where id=p_lead_id;
 if not found or l.owner_id is distinct from auth.uid() or not public.atendhub_is_active_member(l.organization_id) or not public.atendhub_has_client_access(l.organization_id,l.client_id) then raise insufficient_privilege using message='INBOX_START_FORBIDDEN'; end if;
 select * into c from public.atendhub_whatsapp_connections where id=p_connection_id and organization_id=l.organization_id and client_id=l.client_id and status not in ('deleted','delete_pending');
 if not found then raise exception 'CONNECTION_NOT_FOUND'; end if;
 v_phone:=pg_catalog.regexp_replace(coalesce(l.phone,''),'\D','','g');
 if length(v_phone) in (10,11) then v_phone:='55'||v_phone; end if;
 if v_phone !~ '^[1-9][0-9]{6,14}$' then raise exception 'INVALID_PHONE'; end if;
 if v_phone=c.phone then raise exception 'SELF_PHONE'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atendhub_inbox:'||c.client_id::text||':'||v_phone,0));
 select * into l from public.atendhub_leads where id=p_lead_id for update;
 if not found or l.owner_id is distinct from auth.uid() or l.organization_id<>c.organization_id or l.client_id<>c.client_id or not public.atendhub_is_active_member(l.organization_id) or not public.atendhub_has_client_access(l.organization_id,l.client_id) then raise insufficient_privilege using message='INBOX_START_FORBIDDEN'; end if;
 locked_phone:=pg_catalog.regexp_replace(coalesce(l.phone,''),'\D','','g');
 if length(locked_phone) in (10,11) then locked_phone:='55'||locked_phone; end if;
 if locked_phone<>v_phone then raise exception 'LEAD_CHANGED_RETRY'; end if;
 select * into existing from public.atendhub_inbox_conversations where connection_id=c.id and remote_jid=v_phone||'@s.whatsapp.net';
 if found then
  if existing.lead_id<>l.id then raise exception 'CONVERSATION_LEAD_CONFLICT'; end if;
  return existing.id;
 end if;
 insert into public.atendhub_inbox_conversations(organization_id,client_id,connection_id,lead_id,remote_jid,phone)
 values(l.organization_id,l.client_id,c.id,l.id,v_phone||'@s.whatsapp.net',v_phone) returning id into result_id;
 return result_id;
end $$;
revoke all on function public.atendhub_inbox_start_conversation(uuid,uuid) from public,anon,service_role;
grant execute on function public.atendhub_inbox_start_conversation(uuid,uuid) to authenticated;
commit;
