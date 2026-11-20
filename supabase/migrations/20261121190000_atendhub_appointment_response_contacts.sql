begin;
-- Resolve only a claimed appointment-response event, with the scopes recorded for that appointment.
create function public.atendhub_appointment_response_contacts(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select e.payload || jsonb_build_object(
    'id',e.id,
    'eventType',e.event_type,
    'clinicName',c.name,
    'clinicPhone',nullif(regexp_replace(coalesce(c.metadata->>'contactPhone',''),'[^0-9]','','g'),''),
    'patientName',l.name,
    'professionalName',p.name,
    'appointmentLocal',to_char((e.payload->>'startsAt')::timestamptz at time zone (e.payload->>'timezone'),'DD/MM/YYYY às HH24:MI')
  )
  from public.atendhub_appointment_response_events e
  join public.atendhub_eve_reminders r on r.id=e.reminder_id
  join public.atendhub_appointments a on a.id=r.appointment_id
  join public.atendhub_clients c on c.id=a.client_id and c.organization_id=a.organization_id
  join public.atendhub_leads l on l.id=a.lead_id and l.client_id=a.client_id and l.organization_id=a.organization_id
  join public.atendhub_professionals p on p.id=a.professional_id and p.client_id=a.client_id and p.organization_id=a.organization_id
  where e.id=p_id and e.lease_until>now() and e.delivered_at is null;
$$;
revoke all on function public.atendhub_appointment_response_contacts(uuid) from public,anon,authenticated;
grant execute on function public.atendhub_appointment_response_contacts(uuid) to atendhub_integration;
commit;
