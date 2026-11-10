-- Public form submissions are written by a server route using the service role
-- after validating the published snapshot. These indexes make retries idempotent.
create unique index if not exists atendhub_leads_public_submission_key
  on public.atendhub_leads (form_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists atendhub_lead_responses_question_once
  on public.atendhub_lead_responses (lead_id, question_id);

create table if not exists public.atendhub_public_form_events (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.atendhub_forms(id) on delete cascade,
  form_version_id uuid not null references public.atendhub_form_versions(id) on delete cascade,
  session_id text not null,
  event_type text not null check (event_type in ('view', 'action')),
  action_id text,
  occurred_at timestamptz not null default now(),
  unique (form_id, session_id, event_type, action_id)
);

alter table public.atendhub_public_form_events enable row level security;
