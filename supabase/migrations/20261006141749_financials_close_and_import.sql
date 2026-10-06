-- Financials F3: month-end close and reopen, and the actuals import commit, as RPCs the
-- screens call. All three run as the caller (security invoker), so RLS and the existing
-- triggers (period order, closed months, tenant guards) still decide what is allowed; the
-- functions only add readable errors and do the multi-row work in one transaction.

-- ---------------------------------------------------------------------------
-- Close the next month (PMO). The period guard enforces order and that the month has ended;
-- the capture trigger writes forecast history (source close).
-- ---------------------------------------------------------------------------
create function public.close_financial_period(p_organisation_id uuid, p_month date)
returns public.financial_periods
language plpgsql
set search_path = ''
as $$
declare
  result public.financial_periods;
begin
  if not (p_organisation_id = any (private.my_org_ids('pmo'))) then
    raise exception 'Only the PMO can close a month.' using errcode = '42501';
  end if;
  insert into public.financial_periods (organisation_id, period_month, closed_at)
  values (p_organisation_id, date_trunc('month', p_month)::date, now())
  on conflict (organisation_id, period_month) do update set closed_at = excluded.closed_at
    where public.financial_periods.closed_at is null
  returning * into result;
  if result is null then
    raise exception '% is already closed.', to_char(p_month, 'FMMonth YYYY') using errcode = 'P0001';
  end if;
  return result;
end;
$$;
revoke all on function public.close_financial_period(uuid, date) from public, anon;
grant execute on function public.close_financial_period(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Reopen the latest closed month with a reason (PMO). History is not rewritten.
-- ---------------------------------------------------------------------------
create function public.reopen_financial_period(p_organisation_id uuid, p_month date, p_reason text)
returns public.financial_periods
language plpgsql
set search_path = ''
as $$
declare
  result public.financial_periods;
begin
  if not (p_organisation_id = any (private.my_org_ids('pmo'))) then
    raise exception 'Only the PMO can reopen a month.' using errcode = '42501';
  end if;
  update public.financial_periods
  set closed_at = null, reopen_reason = p_reason
  where organisation_id = p_organisation_id and period_month = date_trunc('month', p_month)::date
    and closed_at is not null
  returning * into result;
  if result is null then
    raise exception '% isn''t closed.', to_char(p_month, 'FMMonth YYYY') using errcode = 'P0001';
  end if;
  return result;
end;
$$;
revoke all on function public.reopen_financial_period(uuid, date, text) from public, anon;
grant execute on function public.reopen_financial_period(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The import's rows, read from the jsonb the screen sends. A row with a category instead of a
-- line resolves to the project's active line in that category (the commit first checks there
-- is at most one, and creates it when there is none).
-- ---------------------------------------------------------------------------
create function private.actuals_import_source(p_rows jsonb)
returns table (row_number integer, project_id uuid, cost_line_id uuid, category_id uuid,
               period_month date, amount numeric(14,2), reference text)
language sql
stable
set search_path = ''
as $$
  select r.row_number, r.project_id,
    coalesce(r.cost_line_id,
      (select l.id from public.cost_lines l
       where l.project_id = r.project_id and l.category_id = r.category_id and l.archived_at is null
       order by l.sort_order, l.id limit 1)),
    r.category_id, date_trunc('month', r.period_month)::date, r.amount::numeric(14,2),
    nullif(btrim(r.reference), '')
  from jsonb_to_recordset(p_rows) as r(row_number integer, project_id uuid, cost_line_id uuid,
    category_id uuid, period_month date, amount numeric, reference text);
$$;
revoke all on function private.actuals_import_source(jsonb) from public, anon;
grant execute on function private.actuals_import_source(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Commit an actuals import (PMO), in one transaction.
--   p_rows: [{row_number, project_id, cost_line_id | category_id, period_month, amount, reference}]
--   A row with a category instead of a line goes to the project's one active line in that
--   category, or a new line named after the category when it has none.
--   replace: each line's actual for the month becomes the imported sum (re-importing the same
--   file changes nothing); add: the imported sum is added to it.
-- Returns {import_id, row_count, total, lines_created}.
-- ---------------------------------------------------------------------------
create function public.commit_actuals_import(
  p_workspace_id uuid, p_file_name text, p_mode public.actuals_import_mode, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  new_import uuid;
  bad record;
  n_rows integer;
  n_total numeric(14,2);
  n_created integer := 0;
begin
  if not (p_workspace_id = any (private.my_workspace_ids('pmo'))) then
    raise exception 'Only the PMO can import actuals.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_file_name, '')) = '' then
    raise exception 'The import needs a file name.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'There are no rows to import.' using errcode = 'P0001';
  end if;

  -- Every row must name a project in this workspace, a month, an amount and a line or category.
  select i.row_number into bad from private.actuals_import_source(p_rows) i
  left join public.projects p on p.id = i.project_id and p.workspace_id = p_workspace_id and p.archived_at is null
  where p.id is null or i.period_month is null or i.amount is null or i.row_number is null
    or (i.cost_line_id is null and i.category_id is null)
  order by i.row_number limit 1;
  if found then
    raise exception 'Row %: needs a project in this workspace, a month, an amount and a cost line or category.',
      bad.row_number using errcode = 'P0001';
  end if;
  select i.row_number into bad from private.actuals_import_source(p_rows) i
  group by i.row_number having count(*) > 1 limit 1;
  if found then
    raise exception 'Row % appears more than once.', bad.row_number using errcode = 'P0001';
  end if;

  -- Named lines must be active lines of the row's project.
  select r.row_number into bad
  from jsonb_to_recordset(p_rows) as r(row_number integer, project_id uuid, cost_line_id uuid)
  left join public.cost_lines l on l.id = r.cost_line_id and l.project_id = r.project_id and l.archived_at is null
  where r.cost_line_id is not null and l.id is null
  order by r.row_number limit 1;
  if found then
    raise exception 'Row %: the cost line isn''t an active line of that project.', bad.row_number using errcode = 'P0001';
  end if;

  -- Rows by category: more than one active line in the category is ambiguous.
  select r.row_number into bad
  from jsonb_to_recordset(p_rows) as r(row_number integer, project_id uuid, cost_line_id uuid, category_id uuid)
  join public.cost_lines l on l.project_id = r.project_id and l.category_id = r.category_id and l.archived_at is null
  where r.cost_line_id is null
  group by r.row_number having count(*) > 1
  order by r.row_number limit 1;
  if found then
    raise exception 'Row %: the project has more than one line in that category; choose the line.', bad.row_number
      using errcode = 'P0001';
  end if;

  -- No line in the category yet: create one named after the category.
  with missing as (
    select distinct i.project_id, i.category_id
    from private.actuals_import_source(p_rows) i
    where i.cost_line_id is null and i.category_id is not null
  ), created as (
    insert into public.cost_lines (project_id, name, category_id, spend_type, sort_order)
    select m.project_id, lv.label, m.category_id, 'operating',
      coalesce((select max(l.sort_order) + 1 from public.cost_lines l where l.project_id = m.project_id), 0)
    from missing m
    join public.lookup_values lv on lv.id = m.category_id and lv.list_key = 'cost_category'
    returning 1
  )
  select count(*) into n_created from created;

  select i.row_number into bad from private.actuals_import_source(p_rows) i
  where i.cost_line_id is null order by i.row_number limit 1;
  if found then
    raise exception 'Row %: unknown cost category.', bad.row_number using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(i.amount), 0) into n_rows, n_total from private.actuals_import_source(p_rows) i;
  insert into public.actuals_imports (workspace_id, file_name, mode, row_count, total)
  values (p_workspace_id, btrim(p_file_name), p_mode, n_rows, n_total)
  returning id into new_import;
  insert into public.actuals_import_rows (workspace_id, import_id, row_number, project_id, cost_line_id, period_month, amount, reference)
  select p_workspace_id, new_import, i.row_number, i.project_id, i.cost_line_id, i.period_month, i.amount, i.reference
  from private.actuals_import_source(p_rows) i;

  -- The closed-month trigger on financial_values still applies to every month touched.
  if p_mode = 'replace' then
    insert into public.financial_values (cost_line_id, project_id, period_month, kind, amount)
    select i.cost_line_id, i.project_id, i.period_month, 'actual', sum(i.amount)
    from private.actuals_import_source(p_rows) i group by i.cost_line_id, i.project_id, i.period_month
    on conflict (cost_line_id, period_month, kind) do update set amount = excluded.amount
      where public.financial_values.amount is distinct from excluded.amount;
  else
    insert into public.financial_values (cost_line_id, project_id, period_month, kind, amount)
    select i.cost_line_id, i.project_id, i.period_month, 'actual', sum(i.amount)
    from private.actuals_import_source(p_rows) i group by i.cost_line_id, i.project_id, i.period_month
    on conflict (cost_line_id, period_month, kind) do update
      set amount = public.financial_values.amount + excluded.amount;
  end if;

  return jsonb_build_object('import_id', new_import, 'row_count', n_rows, 'total', n_total, 'lines_created', n_created);
end;
$$;
revoke all on function public.commit_actuals_import(uuid, text, public.actuals_import_mode, jsonb) from public, anon;
grant execute on function public.commit_actuals_import(uuid, text, public.actuals_import_mode, jsonb) to authenticated;
