-- Access uses short-lived signed URLs issued after production permission checks.
insert into storage.buckets(id,name,public)
values ('production-files','production-files',false)
on conflict (id) do nothing;
