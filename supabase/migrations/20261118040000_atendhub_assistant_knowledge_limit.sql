begin;

create or replace function public.atendhub_assistant_read_approved_knowledge(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with event_scope as (
    select r.event_id, r.request_id, r.organization_id, r.client_id, c.metadata
    from public.atendhub_assistant_requests r
    join public.atendhub_clients c
      on c.id = r.client_id and c.organization_id = r.organization_id
    where r.event_id = p_event_id and r.status = 'processing'
  ), approved as (
    select
      entry,
      pg_catalog.row_number() over (order by entry ->> 'category', entry ->> 'question') as ordinal,
      pg_catalog.char_length(
        coalesce(entry ->> 'id', '') || coalesce(entry ->> 'question', '') ||
        coalesce(entry ->> 'answer', '') || coalesce(entry ->> 'source', '') ||
        coalesce(entry ->> 'conditions', '')
      ) as item_chars
    from event_scope s
    cross join lateral pg_catalog.jsonb_array_elements(
      case when jsonb_typeof(s.metadata -> 'knowledge') = 'array'
        then s.metadata -> 'knowledge' else '[]'::jsonb end
    ) as knowledge(entry)
    where entry ->> 'status' = 'approved'
      and pg_catalog.btrim(coalesce(entry ->> 'answer', '')) <> ''
      and pg_catalog.btrim(coalesce(entry ->> 'source', '')) <> ''
  ), ranked as (
    select approved.*,
      pg_catalog.sum(item_chars) over (order by ordinal) as total_chars
    from approved
  ), summary as (
    select
      pg_catalog.count(*) as approved_count,
      pg_catalog.count(*) filter (where ordinal <= 40 and total_chars <= 30000) as returned_count,
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
        ) order by ordinal) filter (where ordinal <= 40 and total_chars <= 30000),
        '[]'::jsonb
      ) as items,
      max(nullif(entry ->> 'updatedAt', '')) as version
    from ranked
  )
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'eventId', s.event_id,
    'requestId', s.request_id,
    'organizationId', s.organization_id,
    'clientId', s.client_id,
    'empty', summary.approved_count = 0,
    'truncated', summary.returned_count < summary.approved_count,
    'version', summary.version,
    'items', summary.items
  )
  from event_scope s cross join summary
$$;

commit;
