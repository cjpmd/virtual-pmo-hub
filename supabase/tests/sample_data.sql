-- GL-9 sample data tests (docs/sql/gl-9-sample-data.sql). Needs only the migrations (no seed):
-- creates its own organisations, runs inside a transaction and rolls everything back. Each
-- check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sample_data.sql
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated;
create temp table ctx (sector text, uid uuid, org uuid);
grant all on ctx to authenticated;

insert into auth.users (id, email, email_confirmed_at) values
  ('e9000000-0000-4000-8000-000000000001', 'gl9.university@example.com', now()),
  ('e9000000-0000-4000-8000-000000000002', 'gl9.public@example.com', now()),
  ('e9000000-0000-4000-8000-000000000003', 'gl9.general@example.com', now()),
  ('e9000000-0000-4000-8000-000000000004', 'gl9.contributor@example.com', now());
insert into public.profiles (id, email, display_name) values
  ('e9000000-0000-4000-8000-000000000001', 'gl9.university@example.com', 'GL9 University'),
  ('e9000000-0000-4000-8000-000000000002', 'gl9.public@example.com', 'GL9 Public'),
  ('e9000000-0000-4000-8000-000000000003', 'gl9.general@example.com', 'GL9 General'),
  ('e9000000-0000-4000-8000-000000000004', 'gl9.contributor@example.com', 'GL9 Contributor')
on conflict (id) do nothing;

create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
create function pg_temp.as_owner() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true); $$;
create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;
-- Runs sql and expects sqlstate (and the hint, when given).
create function pg_temp.raises(name text, sql text, state text, hint text default null) returns void language plpgsql as $$
declare v_state text; v_hint text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    perform pg_temp.ok(name, v_state = state and (hint is null or v_hint = hint));
    return;
  end;
  raise exception 'FAIL: % (no error)', name;
end $$;

-- One organisation per sector, each seeded by its admin.
do $$
declare v record; v_org uuid;
begin
  for v in select * from (values
    ('university', 'e9000000-0000-4000-8000-000000000001'::uuid),
    ('public_sector', 'e9000000-0000-4000-8000-000000000002'::uuid),
    ('general', 'e9000000-0000-4000-8000-000000000003'::uuid)) x(sector, uid)
  loop
    perform pg_temp.as_user(v.uid);
    v_org := public.create_organisation(p_name => 'GL9 ' || v.sector, p_sector => v.sector);
    perform public.seed_sample_data(v_org);
    insert into ctx values (v.sector, v.uid, v_org);
    perform pg_temp.as_owner();
  end loop;
end $$;

-- What was created (counts per organisation; every row flagged).
select pg_temp.ok('5 sample projects per sector', (select bool_and(n = 5) from (
  select count(p.id) n from ctx c left join public.projects p on p.organisation_id = c.org and p.is_sample group by c.org) x));
select pg_temp.ok('every project in a fresh organisation is sample',
  not exists (select 1 from public.projects p join ctx c on c.org = p.organisation_id where not p.is_sample));
select pg_temp.ok('16 tasks, 8 milestones, 3 submitted reports per sector', (select bool_and(t = 16 and m = 8 and s = 3) from (
  select (select count(*) from public.work_items w where w.organisation_id = c.org and w.is_sample) t,
         (select count(*) from public.milestones w where w.organisation_id = c.org and w.is_sample) m,
         (select count(*) from public.status_reports w where w.organisation_id = c.org and w.is_sample and w.status = 'submitted') s
  from ctx c) x));
select pg_temp.ok('1 portfolio, programme, risk, issue, decision and benefit per sector', (select bool_and(x) from (
  select (select count(*) = 1 from public.portfolios w where w.organisation_id = c.org and w.is_sample)
     and (select count(*) = 1 from public.programmes w where w.organisation_id = c.org and w.is_sample)
     and (select count(*) = 1 from public.risks w where w.organisation_id = c.org and w.is_sample)
     and (select count(*) = 1 from public.issues w where w.organisation_id = c.org and w.is_sample)
     and (select count(*) = 1 from public.decisions w where w.organisation_id = c.org and w.is_sample and w.status = 'pending')
     and (select count(*) = 1 from public.benefits w where w.organisation_id = c.org and w.is_sample) x
  from ctx c) y));
select pg_temp.ok('benefit linked to a sample project',
  (select count(*) from public.benefit_projects bp join public.benefits b on b.id = bp.benefit_id
   join ctx c on c.org = b.organisation_id where b.is_sample) = 3);
select pg_temp.ok('no university wording outside the university organisation',
  not exists (select 1 from ctx c, lateral (
      select name as t from public.projects where organisation_id = c.org
      union all select name from public.programmes where organisation_id = c.org
      union all select title from public.benefits where organisation_id = c.org) x
    where c.sector <> 'university' and x.t ~* '(student|campus|research|library|timetabl|enrol)'));
select pg_temp.ok('benefit uses the sector category',
  (select string_agg(l.value, ',' order by c.sector) from ctx c join public.benefits b on b.organisation_id = c.org
   join public.lookup_values l on l.id = b.category_id) = 'Customer experience,Service quality,Student experience');
select pg_temp.ok('no extra members, invites or resources',
  (select bool_and(m = 1 and i = 0 and r <= 1) from (
    select (select count(*) from public.organisation_members x where x.organisation_id = c.org) m,
           (select count(*) from public.organisation_invites x where x.organisation_id = c.org) i,
           (select count(*) from public.resources x where x.organisation_id = c.org) r from ctx c) y));

-- Guards.
select pg_temp.as_user('e9000000-0000-4000-8000-000000000003');
select pg_temp.raises('second seed refused', format('select public.seed_sample_data(%L)', (select org from ctx where sector = 'general')), 'P0001', 'sample_exists');
select pg_temp.raises('admin of another organisation refused', format('select public.seed_sample_data(%L)', (select org from ctx where sector = 'university')), '42501');
select pg_temp.raises('remove in another organisation refused', format('select public.remove_sample_data(%L)', (select org from ctx where sector = 'university')), '42501');
select pg_temp.as_owner();
insert into public.organisation_members (organisation_id, profile_id, role)
select org, 'e9000000-0000-4000-8000-000000000004', 'contributor' from ctx where sector = 'general';
select pg_temp.as_user('e9000000-0000-4000-8000-000000000004');
select pg_temp.raises('contributor cannot seed', format('select public.seed_sample_data(%L)', (select org from ctx where sector = 'general')), '42501');
select pg_temp.raises('contributor cannot remove', format('select public.remove_sample_data(%L)', (select org from ctx where sector = 'general')), '42501');
select pg_temp.as_owner();
select pg_temp.ok('RPCs not executable by anon',
  not has_function_privilege('anon', 'public.seed_sample_data(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.remove_sample_data(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.seed_sample_data(uuid)', 'execute'));

-- Report builder: sample projects are never auto-selected; pinning still works.
create temp table rb (report uuid, sample2 uuid, real uuid);
grant all on rb to authenticated;
select pg_temp.as_user('e9000000-0000-4000-8000-000000000003');
do $$
declare v_org uuid := (select org from ctx where sector = 'general');
  v_portfolio uuid; v_real uuid; v_report uuid;
begin
  select id into v_portfolio from public.portfolios where organisation_id = v_org and is_sample;
  insert into public.projects (organisation_id, workspace_id, portfolio_id, name, code, start_date, finish_date)
  select v_org, workspace_id, v_portfolio, 'Real project', '', current_date - 30, current_date + 90
  from public.portfolios where id = v_portfolio returning id into v_real;
  insert into public.milestones (organisation_id, workspace_id, project_id, title, baseline_date, forecast_date)
  select v_org, workspace_id, v_real, 'Late', current_date + 10, current_date + 40 from public.projects where id = v_real;
  v_report := public.create_report(jsonb_build_object('scope_type', 'portfolio', 'scope_entity_id', v_portfolio, 'title', 'GL9'));
  insert into rb values (v_report,
    (select id from public.projects where organisation_id = v_org and is_sample and name = 'CRM replacement'), v_real);
end $$;
select pg_temp.as_owner();
update public.reports set selection_rules = '{"mode":"any","rules":[{"id":"r1","label":"Milestone slipped","metric":"max_milestone_slip_days","op":">","value":0,"severity":2,"enabled":true}]}'
where id = (select report from rb);
select pg_temp.as_user('e9000000-0000-4000-8000-000000000003');
select public.refresh_report_selection((select report from rb));
select pg_temp.ok('scope metrics carry is_sample',
  (select bool_or((x ->> 'is_sample')::boolean) and bool_or(not (x ->> 'is_sample')::boolean)
   from jsonb_array_elements(public.report_scope_metrics(jsonb_build_object('report_id', (select report from rb)))) x));
select pg_temp.ok('a real project matching the rules is included',
  exists (select 1 from public.report_inclusions where report_id = (select report from rb) and entity_id = (select real from rb) and mode = 'rule'));
select pg_temp.ok('a sample project matching the rules is not',
  not exists (select 1 from public.report_inclusions i join public.projects p on p.id = i.entity_id
              where i.report_id = (select report from rb) and p.is_sample));
select public.set_report_inclusion((select report from rb), (select sample2 from rb), 'pinned');
select pg_temp.ok('a pinned sample project is included with its reasons',
  exists (select 1 from public.report_inclusions where report_id = (select report from rb) and entity_id = (select sample2 from rb)
          and mode = 'pinned' and jsonb_array_length(reasons) = 1));
-- GL-9 follow-up: publishing freezes is_sample on each deep-dive in the snapshot's meta.
select public.publish_report((select report from rb));
select pg_temp.as_owner();
select pg_temp.ok('the published pack records the pinned sample project as sample',
  (select bool_or((d ->> 'id')::uuid = (select sample2 from rb) and (d ->> 'is_sample')::boolean)
   from public.report_snapshots s, jsonb_array_elements(s.data -> 'deep_dives') d
   where s.report_id = (select report from rb) and s.block_instance_id = '__meta'));
select pg_temp.ok('and the real project as not sample',
  (select bool_or((d ->> 'id')::uuid = (select real from rb) and d ? 'is_sample' and not (d ->> 'is_sample')::boolean)
   from public.report_snapshots s, jsonb_array_elements(s.data -> 'deep_dives') d
   where s.report_id = (select report from rb) and s.block_instance_id = '__meta'));
select pg_temp.as_user('e9000000-0000-4000-8000-000000000003');

-- Remove: archives and closes, deletes nothing; a second call is a no-op; seeding again works.
select pg_temp.as_owner();
create temp table before_counts as
select (select count(*) from public.projects p join ctx c on c.org = p.organisation_id) projects,
       (select count(*) from public.work_items p join ctx c on c.org = p.organisation_id) tasks,
       (select count(*) from public.risks p join ctx c on c.org = p.organisation_id) risks;
grant select on before_counts to authenticated;
select pg_temp.as_user('e9000000-0000-4000-8000-000000000003');
select pg_temp.ok('remove archives 5 projects',
  (public.remove_sample_data((select org from ctx where sector = 'general')) ->> 'projects_archived')::int = 5);
select pg_temp.as_owner();
select pg_temp.ok('sample hierarchy archived, real project untouched', (select bool_and(case when is_sample then archived_at is not null else archived_at is null end)
  from public.projects where organisation_id = (select org from ctx where sector = 'general'))
  and (select bool_and(archived_at is not null) from public.programmes where organisation_id = (select org from ctx where sector = 'general'))
  and (select bool_and(archived_at is not null) from public.portfolios where organisation_id = (select org from ctx where sector = 'general') and is_sample));
select pg_temp.ok('sample risk and issue closed, decision withdrawn, benefit closed',
  (select status = 'closed' and closed_at is not null from public.risks where organisation_id = (select org from ctx where sector = 'general') and is_sample)
  and (select status = 'closed' from public.issues where organisation_id = (select org from ctx where sector = 'general') and is_sample)
  and (select status = 'withdrawn' from public.decisions where organisation_id = (select org from ctx where sector = 'general') and is_sample)
  and (select status = 'closed' from public.benefits where organisation_id = (select org from ctx where sector = 'general') and is_sample));
select pg_temp.ok('nothing deleted', (select projects from before_counts) = (select count(*) from public.projects p join ctx c on c.org = p.organisation_id)
  and (select tasks from before_counts) = (select count(*) from public.work_items p join ctx c on c.org = p.organisation_id)
  and (select risks from before_counts) = (select count(*) from public.risks p join ctx c on c.org = p.organisation_id));
select pg_temp.as_user('e9000000-0000-4000-8000-000000000003');
select pg_temp.ok('second remove is a no-op',
  (public.remove_sample_data((select org from ctx where sector = 'general')) ->> 'projects_archived')::int = 0);
select pg_temp.ok('seeding again after removal works',
  public.seed_sample_data((select org from ctx where sector = 'general')) ? 'portfolio_id');

-- Read-only organisation (GL-4): sample data can't be changed.
select pg_temp.as_owner();
update public.organisation_subscriptions set trial_ends_at = now() - interval '1 day'
where organisation_id = (select org from ctx where sector = 'university');
select pg_temp.as_user('e9000000-0000-4000-8000-000000000001');
select pg_temp.raises('read-only organisation cannot remove sample data',
  format('select public.remove_sample_data(%L)', (select org from ctx where sector = 'university')), 'P0001', 'org_read_only');
select pg_temp.as_owner();

select 'sample_data: ' || n || ' checks passed' from passed;
rollback;
