begin;
create table public.atendhub_confirmed_purchases (
  appointment_id uuid primary key references public.atendhub_appointments(id) on delete cascade,
  client_id uuid not null,
  lead_id uuid not null,
  pixel_id text not null,
  occurred_at timestamptz not null default now(),
  next_attempt timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.atendhub_confirmed_purchases enable row level security;
revoke all on public.atendhub_confirmed_purchases from public, anon, authenticated;
grant select,update on public.atendhub_confirmed_purchases to service_role;
create index on public.atendhub_confirmed_purchases(client_id,pixel_id,next_attempt) where sent_at is null;

create function public.atendhub_enqueue_confirmed_purchase() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status <> 'confirmed' then return new; end if;
  if tg_op='UPDATE' and old.status='confirmed' then return new; end if;
  insert into public.atendhub_confirmed_purchases(appointment_id,client_id,lead_id,pixel_id)
  select new.id,new.client_id,l.id,v.definition #>> '{version,settings,tracking,pixelId}'
  from public.atendhub_leads l join public.atendhub_form_versions v
    on v.id=l.form_version_id and v.form_id=l.form_id and v.client_id=l.client_id and v.organization_id=l.organization_id
  where l.id=new.lead_id and l.client_id=new.client_id and l.organization_id=new.organization_id
    and (v.definition #>> '{version,settings,tracking,pixelId}') ~ '^[0-9]{5,30}$'
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.atendhub_enqueue_confirmed_purchase() from public,anon,authenticated;
create trigger atendhub_enqueue_purchase after insert or update of status on public.atendhub_appointments
for each row execute function public.atendhub_enqueue_confirmed_purchase();
commit;
