-- Demo organisation (ORMO, plan demo): hard-delete 17 projects that are too close to real ones.
-- DESTRUCTIVE: run by hand in the Supabase SQL editor (role postgres). Not a migration.
--
-- Checked read-only on production, 17/11/2026:
--   * 17 projects, one match each, all in organisation 98e086a1-6b01-521a-92e9-21dac759c8f4.
--   * No finance rows in a closed month; the one business case is a draft (v1); no Storage
--     objects behind the 3 work-item attachment rows; no notifications or shares.
--   * The withdrawn "Portfolio Report Test" pack (8fa46e2b…) has 33 snapshot blocks (10 name these
--     projects) and 16 metric snapshots for them. Snapshots are immutable, so this script disables
--     the three snapshot_immutable triggers for this transaction only (ALTER TABLE is
--     transactional: they are re-enabled below, and a failure rolls the change back too) and
--     deletes that whole report. Agreed with Chris 17/11/2026.
--   * The draft report "test" (3da8369d…) is scoped to one of these projects: deleted. The other
--     draft "test" (7650fd06…) keeps its row but loses its 5 inclusions of these projects.
--   * 16 benefits linked only to these projects are deleted with them (agreed 17/11/2026).
--   * Audit rows about the deleted records, including those the deletes themselves write, are
--     removed so the names don't survive in Settings › Audit log.
--
-- All or nothing: the final check raises if anything is left, which aborts the transaction and
-- turns the COMMIT into a rollback.

begin;

create temp table demo_del_projects on commit drop as
select id from public.projects
where organisation_id = '98e086a1-6b01-521a-92e9-21dac759c8f4'
  and code in ('ACA','EBB','SMAR','SAM','W11','VDI','DOM','DSA','KBR',
               'STBP','ARB','CAIG','CYB','CSCSI','DMDR','IIRV','STO');

do $$ begin
  if (select count(*) from demo_del_projects) <> 17 then
    raise exception 'Expected 17 projects, found %', (select count(*) from demo_del_projects);
  end if;
end $$;

-- Benefits linked only to these projects (worked out before the links cascade away).
create temp table demo_del_benefits on commit drop as
select b.id from public.benefits b
where b.organisation_id = '98e086a1-6b01-521a-92e9-21dac759c8f4'
  and exists (select 1 from public.benefit_projects bp
              where bp.benefit_id = b.id and bp.project_id in (select id from demo_del_projects))
  and not exists (select 1 from public.benefit_projects bp
                  where bp.benefit_id = b.id and bp.project_id not in (select id from demo_del_projects));

create temp table demo_del_reports on commit drop as
select id from public.reports
where organisation_id = '98e086a1-6b01-521a-92e9-21dac759c8f4'
  and (id = '8fa46e2b-5790-4a87-bb16-08d14cbf4101'
       or scope_entity_id in (select id from demo_del_projects));

-- 1. Reports ---------------------------------------------------------------------------------
alter table public.report_snapshots        disable trigger report_snapshots_immutable;
alter table public.report_metric_snapshots disable trigger report_metric_snapshots_immutable;
alter table public.report_snapshot_objects disable trigger report_snapshot_objects_immutable;

delete from public.report_snapshot_objects    where report_id in (select id from demo_del_reports);
delete from private.report_snapshot_staging   where snapshot_id in
  (select id from public.report_snapshots where report_id in (select id from demo_del_reports));
delete from public.report_snapshots           where report_id in (select id from demo_del_reports);
delete from public.report_metric_snapshots    where report_id in (select id from demo_del_reports);
delete from public.report_metric_snapshots    where entity_id in (select id from demo_del_projects);
delete from public.report_notifications       where report_id in (select id from demo_del_reports);
delete from public.report_approval_reminders  where report_id in (select id from demo_del_reports);
delete from private.report_print_tokens       where report_id in (select id from demo_del_reports);
delete from public.reports                    where id in (select id from demo_del_reports);
delete from public.report_inclusions          where entity_id in (select id from demo_del_projects);

alter table public.report_snapshots        enable trigger report_snapshots_immutable;
alter table public.report_metric_snapshots enable trigger report_metric_snapshots_immutable;
alter table public.report_snapshot_objects enable trigger report_snapshot_objects_immutable;

-- 2. Children whose foreign keys restrict the project delete ----------------------------------
delete from public.health_snapshots           where project_id in (select id from demo_del_projects);
delete from public.milestone_forecast_history where project_id in (select id from demo_del_projects);
delete from public.work_item_events           where project_id in (select id from demo_del_projects);
delete from public.work_item_offers           where project_id in (select id from demo_del_projects);
delete from public.financial_values           where project_id in (select id from demo_del_projects);
delete from public.actuals_import_rows        where project_id in (select id from demo_del_projects);
delete from public.financial_forecast_history where project_id in (select id from demo_del_projects);
delete from public.budget_baselines           where project_id in (select id from demo_del_projects);
delete from public.cost_lines                 where project_id in (select id from demo_del_projects);
delete from public.documents                  where project_id in (select id from demo_del_projects);
delete from public.business_case_versions     where business_case_id in
  (select id from public.business_cases where project_id in (select id from demo_del_projects));
delete from public.business_cases             where project_id in (select id from demo_del_projects);

-- 3. Benefits linked only to these projects --------------------------------------------------
delete from public.pathway_snapshots          where benefit_id in (select id from demo_del_benefits);
delete from public.benefits                   where id in (select id from demo_del_benefits);

-- 4. The projects (everything else cascades: tasks, milestones, RAID, decisions, reports,
--    lessons, team, assignments, roadmap items, dependencies, health, metric history …) ------
delete from public.projects                   where id in (select id from demo_del_projects);

-- 5. Audit rows: the ones these deletes just wrote, and older ones about these records -------
delete from public.audit_log
where organisation_id = '98e086a1-6b01-521a-92e9-21dac759c8f4'
  and (created_at = now()                                   -- written in this transaction
       or entity_id in (select id from demo_del_projects)
       or entity_id in (select id from demo_del_benefits)
       or entity_id in (select id from demo_del_reports)
       or detail::text ~ (select string_agg(id::text, '|') from demo_del_projects));

-- 6. Check nothing is left -------------------------------------------------------------------
do $$
declare r record; n bigint; ids uuid[] := array(select id from demo_del_projects); left_over text := '';
begin
  for r in select c.table_schema, c.table_name, c.column_name
           from information_schema.columns c
           join information_schema.tables t using (table_schema, table_name)
           where c.table_schema in ('public', 'private') and t.table_type = 'BASE TABLE'
             and c.data_type = 'uuid'
             and (c.column_name like '%project_id' or c.column_name in ('entity_id', 'scope_entity_id')
                  or (c.table_name = 'projects' and c.column_name = 'id'))
  loop
    execute format('select count(*) from %I.%I where %I = any($1)', r.table_schema, r.table_name, r.column_name)
      into n using ids;
    if n > 0 then left_over := left_over || format('%s.%s.%s=%s; ', r.table_schema, r.table_name, r.column_name, n); end if;
  end loop;
  if (select count(*) from public.benefits where id in (select id from demo_del_benefits)) > 0 then
    left_over := left_over || 'benefits; ';
  end if;
  if exists (select 1 from pg_trigger where not tgenabled = 'O'
             and tgname in ('report_snapshots_immutable', 'report_metric_snapshots_immutable',
                            'report_snapshot_objects_immutable')) then
    left_over := left_over || 'snapshot triggers not re-enabled; ';
  end if;
  if left_over <> '' then
    raise exception 'Not removed, rolling back: %', left_over;
  end if;
end $$;

commit;

-- Afterwards (optional, read-only): the demo should have 21 active projects.
-- select count(*) from public.projects
-- where organisation_id = '98e086a1-6b01-521a-92e9-21dac759c8f4' and archived_at is null;
