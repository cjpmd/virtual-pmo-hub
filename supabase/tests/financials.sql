-- Financial rules (Stages F2 and F3), as the browser sends them: closed months, month-end
-- close and reopen (RPCs), budget baselines by source, forecast history, the open-month
-- overrun flag, who may write which values, and the actuals import (replace and add). Creates throwaway users in the demo organisation's workspace and
-- runs under the authenticated role; one transaction ending in an exception, so nothing is
-- kept (the final message carries the results).
--   psql "$DB_URL" -f supabase/tests/financials.sql
do $$
declare
  demo_org uuid := (select id from public.organisations where slug = 'demo-university');
  ws uuid := (select id from public.workspaces where organisation_id = demo_org order by created_at limit 1);
  portfolio uuid := (select id from public.portfolios where workspace_id = ws order by name limit 1);
  other_cat uuid := (select id from public.lookup_values where organisation_id = demo_org and list_key = 'cost_category' and value = 'Other');
  contributor uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  pmo uuid := gen_random_uuid();
  proj uuid;
  line uuid;
  cr uuid;
  cutoff date;
  open_month date;
  m date;
  n integer;
  amt numeric;
  staff_cat uuid := (select id from public.lookup_values where organisation_id = demo_org and list_key = 'cost_category' and value = 'Staff');
  imported jsonb;
  f record;
  results text[] := '{}';
  failures integer := 0;
  ok boolean;
  msg text;

  procedure_ok boolean;
begin
  if demo_org is null then raise exception 'Seed the demo organisation first'; end if;

  insert into auth.users (id, email, raw_user_meta_data) values
    (contributor, 'fin-contributor-' || contributor || '@example.invalid', '{"full_name":"Fin Contributor"}'),
    (manager, 'fin-manager-' || manager || '@example.invalid', '{"full_name":"Fin Manager"}'),
    (pmo, 'fin-pmo-' || pmo || '@example.invalid', '{"full_name":"Fin PMO"}');
  insert into public.organisation_members (organisation_id, profile_id, role) values
    (demo_org, contributor, 'viewer'), (demo_org, manager, 'viewer'), (demo_org, pmo, 'pmo');
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role) values
    (ws, contributor, demo_org, 'contributor'), (ws, manager, demo_org, 'manager');

  -- A fresh project with no money yet.
  insert into public.projects (portfolio_id, name) values (portfolio, 'Financials test project') returning id into proj;
  cutoff := private.financial_cutoff(demo_org);
  open_month := (cutoff + interval '1 month')::date;

  -- ---- No baseline: financial health not_set ----
  select h.financial into msg from public.v_project_health h where h.project_id = proj;
  if msg = 'not_set' then results := array_append(results, 'no baseline -> financial not_set: ok');
  else failures := failures + 1; results := array_append(results, format('no baseline: FAIL (%s)', msg)); end if;

  -- ---- Contributor: lines and forecast yes; actuals and the first baseline no ----
  perform set_config('request.jwt.claim.sub', contributor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', contributor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.cost_lines (project_id, name, category_id) values (proj, 'Licences', other_cat) returning id into line;
  insert into public.financial_values (cost_line_id, period_month, kind, amount) values (line, open_month, 'forecast', 1000);
  results := array_append(results, 'contributor adds a line and a forecast: ok');
  procedure_ok := false;
  begin
    insert into public.financial_values (cost_line_id, period_month, kind, amount) values (line, cutoff, 'actual', 10);
  exception when insufficient_privilege then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'contributor actual rejected: ok'); else failures := failures + 1; results := array_append(results, 'contributor actual: FAIL'); end if;
  procedure_ok := false;
  begin
    insert into public.budget_baselines (project_id, total, source) values (proj, 5000, 'initial');
  exception when insufficient_privilege then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'contributor initial baseline rejected: ok'); else failures := failures + 1; results := array_append(results, 'contributor baseline: FAIL'); end if;
  reset role;

  -- ---- Manager: initial baseline once ----
  perform set_config('request.jwt.claim.sub', manager::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.budget_baselines (project_id, total, source) values (proj, 5000, 'initial');
  procedure_ok := false;
  begin
    insert into public.budget_baselines (project_id, total, source) values (proj, 6000, 'initial');
  exception when raise_exception then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'manager initial baseline, second initial rejected: ok'); else failures := failures + 1; results := array_append(results, 'second initial: FAIL'); end if;
  procedure_ok := false;
  begin
    insert into public.budget_baselines (project_id, total, source, reason) values (proj, 9000, 'pmo_adjustment', 'test');
  exception when insufficient_privilege then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'manager PMO adjustment rejected: ok'); else failures := failures + 1; results := array_append(results, 'manager adjustment: FAIL'); end if;
  procedure_ok := false;
  begin
    insert into public.budget_baselines (project_id, total, source, business_case_version_id) values (proj, 1, 'business_case', gen_random_uuid());
  exception when raise_exception then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'business case baseline not available yet: ok'); else failures := failures + 1; results := array_append(results, 'business case baseline: FAIL'); end if;
  -- Change request: approved, and the total must be previous + cost impact.
  reset role;
  insert into public.change_requests (project_id, title, cost_impact, status, type_id)
  values (proj, 'Extra licences', 1500, 'approved',
    (select id from public.lookup_values where organisation_id = demo_org and list_key = 'change_type' order by sort_order limit 1))
  returning id into cr;
  set local role authenticated;
  procedure_ok := false;
  begin
    insert into public.budget_baselines (project_id, total, source, change_request_id) values (proj, 7000, 'change_request', cr);
  exception when raise_exception then procedure_ok := true;
  end;
  insert into public.budget_baselines (project_id, total, source, change_request_id) values (proj, 6500, 'change_request', cr);
  select count(*) into n from public.budget_baselines where project_id = proj;
  if procedure_ok and n = 2 then results := array_append(results, 'change request baseline: wrong total rejected, right total v2: ok');
  else failures := failures + 1; results := array_append(results, format('change request baseline: FAIL (%s, %s)', procedure_ok, n)); end if;
  procedure_ok := false;
  begin
    update public.budget_baselines set total = 1 where project_id = proj;
  exception when insufficient_privilege then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'baselines can''t be updated: ok'); else failures := failures + 1; results := array_append(results, 'baseline update: FAIL'); end if;
  reset role;

  -- ---- PMO: adjustment needs a reason; actuals; the overrun flag ----
  perform set_config('request.jwt.claim.sub', pmo::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pmo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  procedure_ok := false;
  begin
    insert into public.budget_baselines (project_id, total, source, reason) values (proj, 8000, 'pmo_adjustment', '  ');
  exception when check_violation then procedure_ok := true;
  end;
  insert into public.budget_baselines (project_id, total, source, reason) values (proj, 8000, 'pmo_adjustment', 'Re-scoped');
  if procedure_ok then results := array_append(results, 'PMO adjustment needs a reason, then v3: ok'); else failures := failures + 1; results := array_append(results, 'PMO adjustment: FAIL'); end if;
  insert into public.financial_values (cost_line_id, period_month, kind, amount) values (line, cutoff, 'actual', 2500);
  insert into public.financial_values (cost_line_id, period_month, kind, amount) values (line, open_month, 'actual', 1200);
  select * into f from public.v_project_financials where project_id = proj;
  if f.budget = 8000 and f.baseline_version = 3 and f.actual_to_date = 2500 and f.forecast_remaining = 1000 and f.eac = 3500
     and f.variance = 4500 and f.actual_open_months = 1200 and f.open_month_overrun and f.overrun_month = open_month then
    results := array_append(results, 'v_project_financials figures and open-month overrun: ok');
  else failures := failures + 1; results := array_append(results, format('financials: FAIL (%s)', row_to_json(f))); end if;
  select h.financial into msg from public.v_project_health h where h.project_id = proj;
  if msg = 'green' then results := array_append(results, 'with a baseline -> financial green: ok');
  else failures := failures + 1; results := array_append(results, format('health with baseline: FAIL (%s)', msg)); end if;

  -- ---- Month-end close: in order, locks values, captures history; reopen with a reason ----
  m := (cutoff + interval '1 month')::date; -- the open month: not over yet unless cut-off is old
  procedure_ok := false;
  begin
    insert into public.financial_periods (organisation_id, period_month, closed_at)
    values (demo_org, date_trunc('month', private.org_today(demo_org))::date, now());
  exception when raise_exception then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'current month can''t be closed: ok'); else failures := failures + 1; results := array_append(results, 'close current month: FAIL'); end if;
  insert into public.financial_periods (organisation_id, period_month, closed_at) values (demo_org, cutoff, now());
  select count(*) into n from public.financial_forecast_history where project_id = proj and reporting_month = cutoff and source = 'close';
  if n = 1 then results := array_append(results, 'closing captures forecast history (close): ok'); else failures := failures + 1; results := array_append(results, 'close history: FAIL'); end if;
  procedure_ok := false;
  begin
    update public.financial_values set amount = 1 where cost_line_id = line and period_month = cutoff and kind = 'actual';
  exception when raise_exception then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'closed month locked: ok'); else failures := failures + 1; results := array_append(results, 'closed month: FAIL'); end if;
  procedure_ok := false;
  begin
    update public.financial_periods set closed_at = null where organisation_id = demo_org and period_month = cutoff;
  exception when raise_exception then procedure_ok := true;
  end;
  update public.financial_periods set closed_at = null, reopen_reason = 'Late invoice' where organisation_id = demo_org and period_month = cutoff;
  update public.financial_values set amount = 2600 where cost_line_id = line and period_month = cutoff and kind = 'actual';
  if procedure_ok then results := array_append(results, 'reopen needs a reason, then edits allowed: ok'); else failures := failures + 1; results := array_append(results, 'reopen: FAIL'); end if;
  update public.financial_periods set closed_at = now() where organisation_id = demo_org and period_month = cutoff;
  select count(*) into n from public.financial_forecast_history where project_id = proj and reporting_month = cutoff;
  if n = 1 then results := array_append(results, 'closing again adds no second history row: ok'); else failures := failures + 1; results := array_append(results, 'reclose history: FAIL'); end if;
  procedure_ok := false;
  begin
    update public.financial_forecast_history set eac = 0 where project_id = proj;
  exception when insufficient_privilege then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'forecast history is append-only: ok'); else failures := failures + 1; results := array_append(results, 'history update: FAIL'); end if;
  reset role;

  -- ---- Scheduled capture: only projects without a row for the month ----
  n := private.capture_forecast_history(demo_org, cutoff, 'scheduled');
  select count(*) into n from public.financial_forecast_history where project_id = proj and reporting_month = cutoff;
  if n = 1 then results := array_append(results, 'scheduled capture skips existing rows: ok'); else failures := failures + 1; results := array_append(results, 'scheduled: FAIL'); end if;

  -- ---- Month-end RPCs and the actuals import (F3) ----
  perform set_config('request.jwt.claim.sub', manager::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  set local role authenticated;
  procedure_ok := false;
  begin
    perform public.commit_actuals_import(ws, 'x.csv', 'replace',
      jsonb_build_array(jsonb_build_object('row_number', 1, 'project_id', proj, 'cost_line_id', line, 'period_month', open_month, 'amount', 1)));
  exception when insufficient_privilege then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'manager import rejected: ok'); else failures := failures + 1; results := array_append(results, 'manager import: FAIL'); end if;
  procedure_ok := false;
  begin
    perform public.close_financial_period(demo_org, open_month);
  exception when insufficient_privilege then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'manager close rejected: ok'); else failures := failures + 1; results := array_append(results, 'manager close: FAIL'); end if;
  reset role;

  perform set_config('request.jwt.claim.sub', pmo::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pmo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Replace: a named line, a row by category (the project's one Other line) and a new category (creates a line).
  imported := public.commit_actuals_import(ws, 'march.csv', 'replace', jsonb_build_array(
    jsonb_build_object('row_number', 1, 'project_id', proj, 'cost_line_id', line, 'period_month', open_month, 'amount', 100, 'reference', 'INV-1'),
    jsonb_build_object('row_number', 2, 'project_id', proj, 'category_id', other_cat, 'period_month', open_month, 'amount', 50, 'reference', 'INV-2'),
    jsonb_build_object('row_number', 3, 'project_id', proj, 'category_id', staff_cat, 'period_month', open_month, 'amount', 70)));
  select fv.amount into amt from public.financial_values fv where fv.cost_line_id = line and fv.period_month = open_month and fv.kind = 'actual';
  select count(*) into n from public.cost_lines where project_id = proj;
  if amt = 150 and n = 2 and (imported->>'row_count')::int = 3 and (imported->>'total')::numeric = 220 and (imported->>'lines_created')::int = 1 then
    results := array_append(results, 'import replace: sums by line, resolves category, creates a missing line: ok');
  else failures := failures + 1; results := array_append(results, format('import replace: FAIL (%s, %s, %s)', amt, n, imported)); end if;
  perform public.commit_actuals_import(ws, 'march.csv', 'replace', jsonb_build_array(
    jsonb_build_object('row_number', 1, 'project_id', proj, 'cost_line_id', line, 'period_month', open_month, 'amount', 100),
    jsonb_build_object('row_number', 2, 'project_id', proj, 'category_id', other_cat, 'period_month', open_month, 'amount', 50)));
  select fv.amount into amt from public.financial_values fv where fv.cost_line_id = line and fv.period_month = open_month and fv.kind = 'actual';
  if amt = 150 then results := array_append(results, 'import replace again is idempotent: ok'); else failures := failures + 1; results := array_append(results, format('reimport: FAIL (%s)', amt)); end if;
  perform public.commit_actuals_import(ws, 'late.csv', 'add', jsonb_build_array(
    jsonb_build_object('row_number', 1, 'project_id', proj, 'cost_line_id', line, 'period_month', open_month, 'amount', -25)));
  select fv.amount into amt from public.financial_values fv where fv.cost_line_id = line and fv.period_month = open_month and fv.kind = 'actual';
  select count(*) into n from public.actuals_import_rows r join public.actuals_imports i on i.id = r.import_id where r.project_id = proj;
  if amt = 125 and n = 6 then results := array_append(results, 'import add (a credit) and the import log: ok'); else failures := failures + 1; results := array_append(results, format('import add: FAIL (%s, %s)', amt, n)); end if;
  procedure_ok := false;
  begin
    perform public.commit_actuals_import(ws, 'old.csv', 'replace', jsonb_build_array(
      jsonb_build_object('row_number', 1, 'project_id', proj, 'cost_line_id', line, 'period_month', cutoff, 'amount', 1)));
  exception when raise_exception then procedure_ok := (sqlerrm like '%is closed%');
  end;
  if procedure_ok then results := array_append(results, 'import into a closed month rejected: ok'); else failures := failures + 1; results := array_append(results, 'import closed month: FAIL'); end if;
  insert into public.cost_lines (project_id, name, category_id) values (proj, 'More licences', other_cat);
  procedure_ok := false;
  begin
    perform public.commit_actuals_import(ws, 'amb.csv', 'replace', jsonb_build_array(
      jsonb_build_object('row_number', 1, 'project_id', proj, 'category_id', other_cat, 'period_month', open_month, 'amount', 1)));
  exception when raise_exception then procedure_ok := (sqlerrm like '%more than one line%');
  end;
  if procedure_ok then results := array_append(results, 'import by an ambiguous category rejected: ok'); else failures := failures + 1; results := array_append(results, 'ambiguous: FAIL'); end if;
  -- Reopen and close through the RPCs.
  procedure_ok := false;
  begin
    perform public.reopen_financial_period(demo_org, cutoff, '');
  exception when raise_exception then procedure_ok := true;
  end;
  perform public.reopen_financial_period(demo_org, cutoff, 'Late invoice');
  perform public.close_financial_period(demo_org, cutoff);
  select count(*) into n from public.financial_periods where organisation_id = demo_org and period_month = cutoff and closed_at is not null and reopen_reason = 'Late invoice';
  if procedure_ok and n = 1 then results := array_append(results, 'reopen and close RPCs: ok'); else failures := failures + 1; results := array_append(results, format('RPCs: FAIL (%s, %s)', procedure_ok, n)); end if;
  reset role;

  raise exception 'FINANCIALS_RESULT: % failure(s) | %', failures, array_to_string(results, ' | ');
end $$;
