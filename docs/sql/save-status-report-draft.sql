-- APPLIED 15/10/2026 as migration 20261015091539_save_status_report_draft (proposal of the same day).
--
-- The status report form can submit (submit_status_report) but not save a draft; Lovable left a
-- TODO for "Save draft" because reports must not be written to status_reports directly.
--
-- save_status_report_draft(p_project_id, p_report, p_decision_ids, p_report_id,
--                          p_expected_updated_at) returns public.status_reports
--   * p_report_id null: inserts a new report as 'draft' for p_project_id.
--   * p_report_id set: updates that draft (must be on p_project_id and still a draft; optional
--     stale check on updated_at, 40001). It stays a draft.
--   * p_report: the same keys as submit_status_report (reporting_date, submitter_id, overall,
--     schedule, financial, effort, issue, declared_benefit, accomplished, planned, comments,
--     decisions_needed, override_reasons, ai_draft). On update, a key that is present replaces
--     the field (an empty string clears a text field; an empty health rating is 'not_set'); a key
--     that is absent leaves it as it is.
--   * Evidence is never sent or set: evidenced_* and submitted_at stay null on a draft (the
--     existing capture_evidenced_health trigger nulls them on a draft insert and keeps them on a
--     draft update). They are captured only when submit_status_report submits it.
--   * Decision links: p_decision_ids is the draft's list in display order. Missing links are
--     added and every listed link gets its position as sort_order. A link already on the draft
--     but not in p_decision_ids is refused with the same message as submit_status_report
--     ("Remove DEC-0xx from the draft first, or include it"); removing a link from a draft stays
--     a plain delete on status_report_decisions (allowed while the report is a draft). The link
--     rules trigger still applies: Pending decisions of the same project only.
--   * Same permission and validation as submit_status_report: project editors
--     (my_editable_project_ids), 42501 / 22023 / 40001.
-- Additive: one new function, no table change, no DROP / DELETE.

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

-- DRY RUN (15/10/2026, one transaction, rolled back; member and outsider simulated with their
-- JWT subject and role authenticated; two Pending decisions created on ARB inside it):
--   1  member creates a draft with one link        draft, amber/red, evidence null,
--                                                   submitted_at null, 1 link
--   2  member updates it (overall green, clear      draft, green/red kept, comments null, legacy
--      comments, links B then A)                    notes kept, evidence null; B#1, A#2
--   2b stale updated_at                              refused 40001
--   2c a draft link left out of p_decision_ids       refused 22023 ("Remove DEC-018 ...")
--   3  draft links editable by a client update       1 row
--   4  submit_status_report on the draft             submitted, evidence captured, submitted_at set
--   4b change a link after submit                    refused 42501 (frozen)
--   4c save_status_report_draft on it again          refused 22023 ("already been submitted")
--   5  outsider creates a draft on ARB               refused 42501
--   5b outsider updates the member's draft           refused 42501
--   5c outsider sees the drafts                      0 rows
--   6  execute for anon / public                     false / false
-- 12/12 as intended.
