-- rb6: the report-notify job is scheduled and is a no-op without pg_net / Vault secrets.
begin;
do $$
begin
  assert exists (select 1 from cron.job where jobname = 'vpmo-report-notify' and schedule = '*/15 * * * *'), 'job scheduled';
  assert private.trigger_report_notify() is null, 'no call without pg_net, Vault secrets or pending notices';
  assert not has_function_privilege('authenticated', 'private.trigger_report_notify()', 'execute'), 'not callable by users';
end $$;
rollback;
select 'reports_phase6 ok';
