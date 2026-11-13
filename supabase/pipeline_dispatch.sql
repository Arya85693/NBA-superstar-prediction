-- ===========================================================================
-- Run the GitHub pipeline every 15 minutes from Supabase (pg_cron + pg_net).
--
-- Why: GitHub's own `schedule:` trigger is best-effort. In practice it fired
-- roughly every 7-8 hours instead of every 15 minutes, so Fair Value lagged.
-- pg_cron is punctual, so Supabase asks GitHub to run the workflow
-- (workflow_dispatch) on a fixed schedule. The workflow keeps an hourly
-- `schedule:` as a backup; its concurrency group queues overlapping runs.
--
-- Setup (Supabase -> SQL Editor), once:
--   1. Create a GitHub fine-grained personal access token:
--        Repository access: Only select repositories -> NBA-superstar-prediction
--        Permissions: Actions -> Read and write   (nothing else)
--   2. Store it in Vault (run this line yourself with your token; never commit it):
--        select vault.create_secret('<github_pat_...>', 'github_dispatch_token');
--   3. Run the rest of this file.
--
-- Check:  select status_code, created from net._http_response order by created desc limit 5;
--         (GitHub answers 204 when the run was queued; 401/403/404 = token problem)
-- Stop:   select cron.unschedule('pipeline-dispatch-15min');
-- Token expired / rotated:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'github_dispatch_token'), '<new token>');
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running replaces the job instead of adding a second one.
select cron.unschedule(jobid) from cron.job where jobname = 'pipeline-dispatch-15min';

select cron.schedule(
  'pipeline-dispatch-15min',
  '2,17,32,47 * * * *',   -- between the 5-minute ticks, away from GitHub's busy :00
  $cron$
  select net.http_post(
    url := 'https://api.github.com/repos/Arya85693/NBA-superstar-prediction/actions/workflows/update-market-prices.yml/dispatches',
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'github_dispatch_token'),
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'nba-market-pipeline-cron',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main'),
    timeout_milliseconds := 15000
  );
  $cron$
);

select jobid, jobname, schedule, active from cron.job where jobname = 'pipeline-dispatch-15min';
