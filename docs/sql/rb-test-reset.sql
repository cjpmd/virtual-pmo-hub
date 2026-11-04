-- Report builder: reset the TEST project's report data to the seed state (RB-52).
-- For ormo-report-builder-test (afbmohzvyzblwbfsxpnx) only, before an E2E / manual run. Never
-- run on production: it refuses unless the seed's demo organisation (slug reports-demo,
-- is_demo) exists, and production has none.
--
-- What it does, inside the demo organisation only:
--   * deletes every report except the seed's published "previous pack", with its snapshots,
--     metric snapshots, inclusions, narratives, events, print tokens and notifications
--     (snapshot immutability triggers are switched off for this transaction only);
--   * deletes decisions and forum actions created after the seed ran (test fixtures, actions
--     recorded in presentation mode);
--   * puts the seed's pending decision RD06 (…0701) back to Pending and removes the events
--     recorded against it since the seed.
-- Project data, forums, meetings and users are left alone. Run as postgres (SQL editor or psql).
begin;

do $$
declare
  org uuid := 'd0000000-0000-4000-8000-000000000100';
  prev uuid;
  seeded timestamptz;
begin
  if not exists (select 1 from public.organisations where id = org and slug = 'reports-demo' and is_demo) then
    raise exception 'Not the report builder test project (no reports-demo organisation). Nothing changed.';
  end if;
  select created_at into seeded from public.forums where id = 'd0000000-0000-4000-8000-000000000501';
  seeded := seeded + interval '1 minute';
  select r.id into prev from public.reports r
  where r.organisation_id = org and r.title = 'Digital Care Programme Board — previous pack' and r.created_at < seeded;

  create temp table rb_reset_reports on commit drop as
    select r.id from public.reports r where r.organisation_id = org and r.id is distinct from prev;

  alter table public.report_snapshots disable trigger report_snapshots_immutable;
  alter table public.report_metric_snapshots disable trigger report_metric_snapshots_immutable;
  delete from public.report_snapshots where report_id in (select id from rb_reset_reports);
  delete from public.report_metric_snapshots where report_id in (select id from rb_reset_reports);
  alter table public.report_snapshots enable trigger report_snapshots_immutable;
  alter table public.report_metric_snapshots enable trigger report_metric_snapshots_immutable;
  delete from private.report_print_tokens where report_id in (select id from rb_reset_reports);
  delete from public.report_notifications where report_id in (select id from rb_reset_reports);

  delete from public.forum_actions where organisation_id = org and created_at > seeded;
  delete from public.decisions where organisation_id = org and created_at > seeded;
  update public.decisions set status = 'pending', chosen_option_id = null, rationale = null, decision_date = null,
    decided_by_resource_id = null, decided_by_forum_id = null, recorded_by = null, recorded_at = null,
    decided_meeting_id = null, report_id = null, supersedes_id = null
  where id = 'd0000000-0000-4000-8000-000000000701';
  delete from public.decision_events where decision_id = 'd0000000-0000-4000-8000-000000000701' and created_at > seeded;

  -- reports chain to each other (previous_report_id, set null on delete); inclusions,
  -- narratives and events cascade.
  delete from public.reports where id in (select id from rb_reset_reports);

  raise notice 'Reset done: kept previous pack %, removed % reports.', prev, (select count(*) from rb_reset_reports);
end $$;

commit;
