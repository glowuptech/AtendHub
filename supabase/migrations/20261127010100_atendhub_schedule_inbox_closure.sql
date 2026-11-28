begin;
create extension if not exists pg_cron;
select cron.schedule('atendhub-close-idle-conversations', '*/5 * * * *',
  'select public.atendhub_close_idle_conversations()');
commit;
