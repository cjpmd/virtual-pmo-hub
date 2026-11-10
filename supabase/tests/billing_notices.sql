-- GL-6 billing notice tests (docs/sql/gl-6-billing-notices.sql). Runs against a seeded database
-- (the local Postgres: supabase/tests/local/run.sh migrate && run.sh seed) inside a transaction
-- and rolls everything back. Each check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing_notices.sql
\set ON_ERROR_STOP 1
begin;

create temp table ctx as
select m.organisation_id as org, m.profile_id as admin
from public.organisation_members m where m.role = 'admin' order by m.created_at limit 1;
create temp table passed (n integer);
insert into passed values (0);

do $$ begin
  if (select org from ctx) is null then raise exception 'Seed the database first'; end if;
end $$;

update public.organisations set is_demo = false where id = (select org from ctx);
update public.profiles set email = 'gl6.admin@example.com' where id = (select admin from ctx);
insert into public.organisation_subscriptions (organisation_id, plan, trial_ends_at)
select org, 'trial', now() + interval '7 days' from ctx
on conflict (organisation_id) do nothing;

create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;
-- Sets the subscription; p_changed (optional) is when the status changed.
create function pg_temp.set_sub(p_plan text, p_status text, p_trial_ends timestamptz,
  p_period_end timestamptz default null, p_changed timestamptz default null, p_sub text default null)
returns void language plpgsql as $$
begin
  update public.organisation_subscriptions
  set plan = p_plan, status = p_status, trial_ends_at = p_trial_ends, current_period_end = p_period_end,
      stripe_subscription_id = p_sub
  where organisation_id = (select org from ctx);
  if p_changed is not null then
    update public.organisation_subscriptions set status_changed_at = p_changed
    where organisation_id = (select org from ctx);
  end if;
end $$;
create function pg_temp.queued(p_kind text) returns integer language sql as $$
  select count(*)::integer from public.billing_notices
  where organisation_id = (select org from ctx) and kind = p_kind; $$;
create function pg_temp.reset() returns void language sql as $$
  delete from public.billing_notices where organisation_id = (select org from ctx); $$;
create function pg_temp.pending() returns jsonb language sql as $$
  select coalesce((select jsonb_agg(x) from jsonb_array_elements(public.pending_billing_notices()) x
                   where x ->> 'organisation_id' = (select org from ctx)::text), '[]'::jsonb); $$;

-- 1. Trial ending: inside 3 days, once only.
select pg_temp.set_sub('trial', null, now() + interval '5 days');
select private.queue_billing_notices();
select pg_temp.ok('no trial_ending with 5 days left', pg_temp.queued('trial_ending') = 0);
select pg_temp.set_sub('trial', null, now() + interval '2 days');
select private.queue_billing_notices();
select private.queue_billing_notices();
select pg_temp.ok('trial_ending queued once with 2 days left', pg_temp.queued('trial_ending') = 1);
select pg_temp.ok('pending lists it, still applies, with the admin',
  (select (x ->> 'still_applies')::boolean and x -> 'recipients' @> '[{"email": "gl6.admin@example.com", "bounced": false}]'
   from jsonb_array_elements(pg_temp.pending()) x where x ->> 'kind' = 'trial_ending'));
select pg_temp.set_sub('trial', null, now() + interval '30 days');
select pg_temp.ok('an extended trial no longer applies',
  (select not (x ->> 'still_applies')::boolean from jsonb_array_elements(pg_temp.pending()) x where x ->> 'kind' = 'trial_ending'));
select private.queue_billing_notices();
select pg_temp.ok('extended trial queues nothing new', pg_temp.queued('trial_ending') = 1);
select pg_temp.set_sub('monthly', 'active', now() + interval '2 days', now() + interval '20 days');
select private.queue_billing_notices();
select pg_temp.ok('subscribed: no trial_ending', pg_temp.queued('trial_ending') = 1);
select pg_temp.reset();

-- 2. Trial ended: in the last 7 days only, and read-only.
select pg_temp.set_sub('trial', null, now() - interval '10 days');
select private.queue_billing_notices();
select pg_temp.ok('no trial_ended 10 days on', pg_temp.queued('trial_ended') = 0);
select pg_temp.set_sub('trial', null, now() - interval '1 day');
select private.queue_billing_notices();
select private.queue_billing_notices();
select pg_temp.ok('trial_ended queued once', pg_temp.queued('trial_ended') = 1);
select pg_temp.ok('trial_ended applies while read-only',
  (select (x ->> 'still_applies')::boolean and not (x ->> 'writable')::boolean
   from jsonb_array_elements(pg_temp.pending()) x where x ->> 'kind' = 'trial_ended'));
select pg_temp.reset();

-- 3. Demo plan: nothing.
select pg_temp.set_sub('demo', null, now() + interval '1 day');
select private.queue_billing_notices();
select pg_temp.set_sub('demo', 'canceled', null, now() - interval '1 day', now());
select private.queue_billing_notices();
select pg_temp.ok('demo gets no notices', (select count(*) from public.billing_notices where organisation_id = (select org from ctx)) = 0);

-- 4. Read-only: canceled now, past_due beyond the grace, one notice per period.
select pg_temp.set_sub('monthly', 'past_due', null, now() + interval '20 days', now() - interval '3 days', 'sub_gl6');
select private.queue_billing_notices();
select pg_temp.ok('past_due inside the grace: no read_only', pg_temp.queued('read_only') = 0);
select pg_temp.ok('grace date is 14 days from the failure',
  (select abs(extract(epoch from (private.past_due_grace_ends_at(status_changed_at, current_period_end)
     - (now() + interval '11 days')))) < 5 from public.organisation_subscriptions where organisation_id = (select org from ctx)));
select pg_temp.set_sub('monthly', 'past_due', null, now() + interval '20 days', now() - interval '15 days', 'sub_gl6');
select private.queue_billing_notices();
select pg_temp.ok('past_due beyond the grace: read_only', pg_temp.queued('read_only') = 1);
update public.organisation_subscriptions set status = 'canceled' where organisation_id = (select org from ctx);
select private.queue_billing_notices();
select pg_temp.ok('past_due then canceled in the same period: still one', pg_temp.queued('read_only') = 1);
select pg_temp.reset();
select pg_temp.set_sub('monthly', 'past_due', null, now() + interval '20 days', now() - interval '25 days', 'sub_gl6');
select private.queue_billing_notices();
select pg_temp.ok('grace ended 11 days ago: outside the window', pg_temp.queued('read_only') = 0);
select pg_temp.set_sub('monthly', 'canceled', null, now() - interval '1 day', now() - interval '20 days', 'sub_gl6b');
select private.queue_billing_notices();
select pg_temp.ok('canceled 20 days ago: outside the window', pg_temp.queued('read_only') = 0);
select pg_temp.set_sub('monthly', 'canceled', null, now() - interval '1 day', now(), 'sub_gl6c');
select private.queue_billing_notices();
select pg_temp.ok('canceled now: read_only', pg_temp.queued('read_only') = 1);
select pg_temp.set_sub('monthly', 'active', null, now() + interval '30 days', null, 'sub_gl6d');
select pg_temp.ok('resubscribed: read_only no longer applies',
  (select not (x ->> 'still_applies')::boolean from jsonb_array_elements(pg_temp.pending()) x where x ->> 'kind' = 'read_only'));
select pg_temp.reset();

-- 5. payment_failed (queued by the webhook as the service role) and its re-check.
select pg_temp.set_sub('monthly', 'past_due', null, now() + interval '20 days', now(), 'sub_gl6');
insert into public.billing_notices (organisation_id, kind, period_key, details)
select org, 'payment_failed', 'in_gl6', '{"amount_due": 1200, "currency": "gbp"}' from ctx;
insert into public.billing_notices (organisation_id, kind, period_key)
select org, 'payment_failed', 'in_gl6' from ctx on conflict do nothing;
select pg_temp.ok('payment_failed once per invoice', pg_temp.queued('payment_failed') = 1);
select pg_temp.ok('payment_failed applies while past_due, with the grace date',
  (select (x ->> 'still_applies')::boolean and (x ->> 'grace_ends_at') is not null
   from jsonb_array_elements(pg_temp.pending()) x where x ->> 'kind' = 'payment_failed'));
select pg_temp.set_sub('monthly', 'active', null, now() + interval '30 days', null, 'sub_gl6');
select pg_temp.ok('paid since: payment_failed no longer applies',
  (select not (x ->> 'still_applies')::boolean from jsonb_array_elements(pg_temp.pending()) x where x ->> 'kind' = 'payment_failed'));

-- 6. Bounced admin addresses are flagged (latest Resend status on any invitation).
insert into public.organisation_invites (organisation_id, email, role, email_status, email_status_at, revoked_at)
select org, 'gl6.admin@example.com', 'viewer', 'delivered', now() - interval '2 days', now() from ctx;
insert into public.organisation_invites (organisation_id, email, role, email_status, email_status_at, revoked_at)
select org, 'gl6.admin@example.com', 'viewer', 'bounced', now() - interval '1 day', now() from ctx;
select pg_temp.ok('bounced address flagged',
  (select x -> 'recipients' @> '[{"email": "gl6.admin@example.com", "bounced": true}]'
   from jsonb_array_elements(pg_temp.pending()) x where x ->> 'kind' = 'payment_failed'));
insert into public.organisation_invites (organisation_id, email, role, email_status, email_status_at, revoked_at)
select org, 'gl6.admin@example.com', 'viewer', 'delivered', now(), now() from ctx;
select pg_temp.ok('a later delivery clears the flag',
  (select x -> 'recipients' @> '[{"email": "gl6.admin@example.com", "bounced": false}]'
   from jsonb_array_elements(pg_temp.pending()) x where x ->> 'kind' = 'payment_failed'));

-- 7. Marking: sent, skipped, and failed after five errors.
select public.mark_billing_notice(id, 'sent', 2, 1, null) from public.billing_notices
where organisation_id = (select org from ctx) and kind = 'payment_failed';
select pg_temp.ok('sent recorded with counts',
  (select status = 'sent' and recipient_count = 2 and skipped_count = 1 and sent_at is not null
   from public.billing_notices where organisation_id = (select org from ctx) and kind = 'payment_failed'));
select pg_temp.ok('a sent notice is no longer pending', jsonb_array_length(pg_temp.pending()) = 0);
insert into public.billing_notices (organisation_id, kind, period_key) select org, 'read_only', 'gl6-err' from ctx;
select public.mark_billing_notice(id, 'error', 0, 0, 'resend 500') from public.billing_notices
where organisation_id = (select org from ctx) and period_key = 'gl6-err';
select pg_temp.ok('one error stays pending',
  (select status = 'pending' and attempts = 1 and error = 'resend 500' from public.billing_notices where period_key = 'gl6-err'));
select public.mark_billing_notice(id, 'error', 0, 0, 'resend 500') from public.billing_notices, generate_series(1, 4)
where period_key = 'gl6-err';
select pg_temp.ok('the fifth error marks it failed',
  (select status = 'failed' and attempts = 5 from public.billing_notices where period_key = 'gl6-err'));
insert into public.billing_notices (organisation_id, kind, period_key) select org, 'read_only', 'gl6-skip' from ctx;
select public.mark_billing_notice(id, 'skipped', 0, 1, 'every admin address bounced') from public.billing_notices
where period_key = 'gl6-skip';
select pg_temp.ok('skipped recorded',
  (select status = 'skipped' and skipped_count = 1 and sent_at is not null from public.billing_notices where period_key = 'gl6-skip'));
do $$ begin
  perform public.mark_billing_notice(gen_random_uuid(), 'nonsense', 0, 0, null);
  raise exception 'FAIL: unknown outcome accepted';
exception when sqlstate '22023' then update passed set n = n + 1;
end $$;

-- 8. System writes work while read-only (the trigger lets cron / service role through).
select pg_temp.set_sub('trial', null, now() - interval '1 day');
select pg_temp.ok('organisation is read-only', not private.organisation_is_writable((select org from ctx)));
select private.queue_billing_notices();
select pg_temp.ok('the job queues while read-only', pg_temp.queued('trial_ended') = 1);

-- 9. Access and wiring.
select pg_temp.ok('billing_notices has zz_org_read_only',
  exists (select 1 from pg_trigger where tgrelid = 'public.billing_notices'::regclass and tgname = 'zz_org_read_only'));
select pg_temp.ok('clients cannot read billing_notices',
  not has_table_privilege('authenticated', 'public.billing_notices', 'select')
  and not has_table_privilege('anon', 'public.billing_notices', 'select'));
select pg_temp.ok('RPCs are service role only',
  not has_function_privilege('authenticated', 'public.pending_billing_notices()', 'execute')
  and not has_function_privilege('anon', 'public.pending_billing_notices()', 'execute')
  and not has_function_privilege('authenticated', 'public.mark_billing_notice(uuid, text, integer, integer, text)', 'execute')
  and has_function_privilege('service_role', 'public.mark_billing_notice(uuid, text, integer, integer, text)', 'execute'));
select pg_temp.ok('private functions not executable by clients',
  not has_function_privilege('authenticated', 'private.queue_billing_notices()', 'execute')
  and not has_function_privilege('authenticated', 'private.run_billing_notices()', 'execute')
  and not has_function_privilege('anon', 'private.past_due_grace_ends_at(timestamptz, timestamptz)', 'execute'));
select pg_temp.ok('run_billing_notices is harmless without pg_net or outside 08:00', private.run_billing_notices() is null);

select 'billing_notices: ' || n || ' checks passed' from passed;
rollback;
