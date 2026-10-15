-- APPLIED 15/10/2026. save_status_report_draft: create or update a draft status report and its decision links.
-- Proposal and dry run: docs/sql/save-status-report-draft.sql.
create function public.save_status_report_draft(
  p_project_id uuid,
  p_report jsonb,
  p_decision_ids uuid[] default '{}',
  p_report_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns public.status_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.status_reports;
  v_org uuid;
  extra text;
begin
  if p_project_id is null or not (p_project_id = any (private.my_editable_project_ids())) then
    raise exception 'You can''t save a status report for this project.' using errcode = '42501';
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'The report is missing.' using errcode = '22023';
  end if;
  select organisation_id into v_org from public.projects where id = p_project_id;

  if p_report_id is null then
    insert into public.status_reports (
      project_id, reporting_date, submitter_id, status, overall, schedule, financial, effort, issue,
      declared_benefit, accomplished, planned, comments, decisions_needed, override_reasons, ai_draft)
    values (
      p_project_id,
      coalesce(nullif(p_report ->> 'reporting_date', '')::date, private.org_today(v_org)),
      nullif(p_report ->> 'submitter_id', '')::uuid,
      'draft',
      coalesce(nullif(p_report ->> 'overall', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'schedule', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'financial', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'effort', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'issue', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'declared_benefit', '')::public.health, 'not_set'),
      p_report ->> 'accomplished', p_report ->> 'planned', nullif(p_report ->> 'comments', ''),
      nullif(p_report ->> 'decisions_needed', ''),
      coalesce(p_report -> 'override_reasons', '{}'::jsonb), p_report -> 'ai_draft')
    returning * into r;
  else
    select * into r from public.status_reports where id = p_report_id for update;
    if r.id is null or r.project_id <> p_project_id then
      raise exception 'That report isn''t on this project.' using errcode = '42501';
    end if;
    if p_expected_updated_at is not null and r.updated_at is distinct from p_expected_updated_at then
      raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
    end if;
    if r.status <> 'draft' then
      raise exception '% has already been submitted.', r.ref using errcode = '22023';
    end if;
    update public.status_reports set
      reporting_date = case when p_report ? 'reporting_date'
        then coalesce(nullif(p_report ->> 'reporting_date', '')::date, reporting_date) else reporting_date end,
      submitter_id = case when p_report ? 'submitter_id' then nullif(p_report ->> 'submitter_id', '')::uuid else submitter_id end,
      overall = case when p_report ? 'overall' then coalesce(nullif(p_report ->> 'overall', '')::public.health, 'not_set') else overall end,
      schedule = case when p_report ? 'schedule' then coalesce(nullif(p_report ->> 'schedule', '')::public.health, 'not_set') else schedule end,
      financial = case when p_report ? 'financial' then coalesce(nullif(p_report ->> 'financial', '')::public.health, 'not_set') else financial end,
      effort = case when p_report ? 'effort' then coalesce(nullif(p_report ->> 'effort', '')::public.health, 'not_set') else effort end,
      issue = case when p_report ? 'issue' then coalesce(nullif(p_report ->> 'issue', '')::public.health, 'not_set') else issue end,
      declared_benefit = case when p_report ? 'declared_benefit'
        then coalesce(nullif(p_report ->> 'declared_benefit', '')::public.health, 'not_set') else declared_benefit end,
      accomplished = case when p_report ? 'accomplished' then p_report ->> 'accomplished' else accomplished end,
      planned = case when p_report ? 'planned' then p_report ->> 'planned' else planned end,
      comments = case when p_report ? 'comments' then nullif(p_report ->> 'comments', '') else comments end,
      decisions_needed = case when p_report ? 'decisions_needed' then nullif(p_report ->> 'decisions_needed', '') else decisions_needed end,
      override_reasons = case when p_report ? 'override_reasons' then coalesce(p_report -> 'override_reasons', '{}'::jsonb) else override_reasons end,
      ai_draft = case when p_report ? 'ai_draft' then p_report -> 'ai_draft' else ai_draft end
    where id = r.id
    returning * into r;

    select string_agg(d.ref, ', ' order by d.ref) into extra
    from public.status_report_decisions l join public.decisions d on d.id = l.decision_id
    where l.status_report_id = r.id and not (l.decision_id = any (coalesce(p_decision_ids, '{}')));
    if extra is not null then
      raise exception 'Remove % from the draft first, or include it.', extra using errcode = '22023';
    end if;
  end if;

  -- Listed links in display order: add the missing ones, renumber the rest.
  insert into public.status_report_decisions (status_report_id, decision_id, sort_order)
  select r.id, x.id, x.ord::integer
  from unnest(coalesce(p_decision_ids, '{}')) with ordinality as x(id, ord)
  where not exists (
    select 1 from public.status_report_decisions l where l.status_report_id = r.id and l.decision_id = x.id);
  update public.status_report_decisions l set sort_order = x.ord::integer
  from unnest(coalesce(p_decision_ids, '{}')) with ordinality as x(id, ord)
  where l.status_report_id = r.id and l.decision_id = x.id and l.sort_order <> x.ord::integer;
  return r;
end;
$$;
revoke all on function public.save_status_report_draft(uuid, jsonb, uuid[], uuid, timestamptz) from public, anon;
grant execute on function public.save_status_report_draft(uuid, jsonb, uuid[], uuid, timestamptz) to authenticated;

