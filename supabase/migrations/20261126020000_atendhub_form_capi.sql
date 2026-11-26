begin;
create table public.atendhub_form_capi (
  form_id uuid primary key references public.atendhub_forms(id) on delete cascade,
  pixel_id text not null,
  secret jsonb not null,
  test_code text
);
alter table public.atendhub_form_capi enable row level security;
revoke all on public.atendhub_form_capi from public, anon, authenticated;
grant select,insert,update,delete on public.atendhub_form_capi to service_role;
alter table public.atendhub_confirmed_purchases add column form_id uuid references public.atendhub_forms(id) on delete cascade;
update public.atendhub_confirmed_purchases p set form_id=l.form_id
from public.atendhub_leads l where l.id=p.lead_id and l.client_id=p.client_id;
create or replace function public.atendhub_enqueue_confirmed_purchase() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status <> 'confirmed' then return new; end if;
  if tg_op='UPDATE' and old.status='confirmed' then return new; end if;
  insert into public.atendhub_confirmed_purchases(appointment_id,client_id,lead_id,pixel_id,form_id)
  select new.id,new.client_id,l.id,v.definition #>> '{version,settings,tracking,pixelId}',l.form_id
  from public.atendhub_leads l join public.atendhub_form_versions v
    on v.id=l.form_version_id and v.form_id=l.form_id and v.client_id=l.client_id and v.organization_id=l.organization_id
  where l.id=new.lead_id and l.client_id=new.client_id and l.organization_id=new.organization_id
    and (v.definition #>> '{version,settings,tracking,pixelId}') ~ '^[0-9]{5,30}$'
  on conflict do nothing;
  return new;
end;
$$;
commit;
