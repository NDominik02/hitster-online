do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'cleanup_old_rooms';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'cleanup_old_rooms',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://cynedrshuqneztnymbxu.supabase.co/functions/v1/cleanup_old_rooms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role'
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
