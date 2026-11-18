begin;

create function public.atendhub_assistant_read_approved_knowledge(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'eventId', r.event_id,
    'requestId', r.request_id,
    'organizationId', r.organization_id,
    'clientId', r.client_id,
    'empty', pg_catalog.jsonb_array_length(k.items) = 0,
    'version', k.version,
    'items', k.items
  )
  from public.atendhub_assistant_requests r
  join public.atendhub_clients c
    on c.id = r.client_id and c.organization_id = r.organization_id
  cross join lateral (
    select
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', entry ->> 'id',
          'version', entry ->> 'updatedAt',
          'category', entry ->> 'category',
          'question', entry ->> 'question',
          'answer', entry ->> 'answer',
          'source', entry ->> 'source',
          'priceCents', entry -> 'priceCents',
          'currency', entry ->> 'currency',
          'conditions', entry ->> 'conditions'
        ) order by entry ->> 'category', entry ->> 'question'),
        '[]'::jsonb
      ) as items,
      max(nullif(entry ->> 'updatedAt', '')) as version
    from pg_catalog.jsonb_array_elements(
      case when jsonb_typeof(c.metadata -> 'knowledge') = 'array'
        then c.metadata -> 'knowledge' else '[]'::jsonb end
    ) as knowledge(entry)
    where entry ->> 'status' = 'approved'
      and pg_catalog.btrim(coalesce(entry ->> 'answer', '')) <> ''
      and pg_catalog.btrim(coalesce(entry ->> 'source', '')) <> ''
  ) k
  where r.event_id = p_event_id
    and r.status = 'processing'
$$;

revoke all on function public.atendhub_assistant_read_approved_knowledge(uuid) from public, anon, authenticated;
grant execute on function public.atendhub_assistant_read_approved_knowledge(uuid) to service_role;

commit;
