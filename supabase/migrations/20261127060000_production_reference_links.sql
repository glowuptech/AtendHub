alter table public.atendhub_production_tasks
  add column reference_links text[] not null default '{}';
