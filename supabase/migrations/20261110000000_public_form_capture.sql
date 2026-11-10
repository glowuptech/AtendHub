-- Public form submissions are written by a server route using the service role
-- after validating the published snapshot. These indexes make retries idempotent.
create unique index if not exists atendhub_leads_public_submission_key
  on public.atendhub_leads (form_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists atendhub_lead_responses_question_once
  on public.atendhub_lead_responses (lead_id, question_id);
