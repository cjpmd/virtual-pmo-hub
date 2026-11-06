-- convert-request-to-project.sql
-- New migration: approved project requests → projects.
--
-- Changes:
--   1. Partial unique index on projects(converted_from_request_id) — prevents double conversion.
--   2. Add converted_from_request_ref to v_projects (lateral join to project_requests).
--   3. Extend audit_log_action_check with 'request.converted'.
--   4. RPC public.convert_request_to_project(p_request_id, p_overrides).
--
-- Permission: caller must have workspace 'manager' (or above) role.
-- The RPC is SECURITY INVOKER — every INSERT/UPDATE is subject to the caller's RLS policies.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- 1. Partial unique index: at most one project may reference a given request.
create unique index projects_converted_from_request_uniq
  on public.projects (converted_from_request_id)
  where converted_from_request_id is not null;

-- 2. Rebuild v_projects to surface converted_from_request_ref.
--    The lateral join reads project_requests (security_invoker view, so caller's RLS applies
--    to the view query; the ref column of project_requests is visible to workspace members).
create or replace view public.v_projects with (security_invoker = true) as
select
  p.id, p.organisation_id, p.workspace_id, p.programme_id, p.portfolio_id, p.name, p.code, p.tier, p.state, p.priority,
  p.start_date, p.finish_date, p.baseline_finish_date,
  coalesce(f.budget, 0)::numeric(14,2) as budget,
  coalesce(f.actual_to_date, 0)::numeric(14,2) as actual,
  coalesce(f.eac, 0)::numeric(14,2) as forecast,
  p.business_case, p.benefits_summary, p.task_source, p.health_override, p.health_override_reason, p.closed_reason,
  p.archived_at, p.converted_from_request_id, p.manager_id, p.project_officer_id, p.sponsor_id, p.phase_id,
  p.created_at, p.updated_at, p.created_by,
  coalesce(p.portfolio_id, pr.portfolio_id) as effective_portfolio_id,
  coalesce(ph.phase_index, 0) as phase_index,
  ph.phase_count,
  coalesce(f.has_baseline, false) as has_baseline,
  req.ref as converted_from_request_ref
from public.projects p
left join public.programmes pr on pr.id = p.programme_id
left join lateral (
  select x.phase_index, x.phase_count
  from (
    select lp.id, (row_number() over (order by lp.sort_order) - 1)::integer as phase_index, count(*) over ()::integer as phase_count
    from public.lifecycle_phases lp where lp.organisation_id = p.organisation_id
  ) x
  where x.id = p.phase_id
) ph on true
left join public.v_project_financials f on f.project_id = p.id
left join public.project_requests req on req.id = p.converted_from_request_id
where p.archived_at is null;

-- 3. Extend audit_log_action_check with 'request.converted'.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  -- row changes (private.audit_row_change)
  'insert', 'update', 'delete',
  -- invitations
  'invite.created', 'invite.sent', 'invite.send_failed', 'invite.revoked', 'invite.accepted',
  'invite.bounced', 'invite.suppressed', 'invite.complained',
  -- members
  'member.role_changed', 'member.removed',
  -- join requests and domains
  'join_settings.changed', 'join_domain.added', 'join_domain.removed',
  'join_request.created', 'join_request.withdrawn', 'join_request.approved', 'join_request.declined',
  -- billing
  'billing.seats_added', 'billing.seat_reduction_scheduled', 'billing.scheduled_change_cancelled',
  'billing.interval_switch_scheduled',
  'seats.changed', 'seats.change_scheduled', 'seats.scheduled_change_cleared',
  -- request conversion
  'request.converted'
));

comment on constraint audit_log_action_check on public.audit_log is
  'Row operations plus work package events. Add new event names here.';

-- 4. RPC: convert_request_to_project
--
-- Atomically:
--   Step 1 — lock the request row; verify status and permission.
--   Step 2 — if not yet 'approved', approve it.
--   Step 3 — insert the project (request fields + p_overrides).
--   Step 4 — convert each request_benefit_draft into a benefit (+ measure + objective + project link).
--   Step 5 — re-point any business_cases that referenced the request to the new project.
--   Step 6 — write an audit log entry.
--   Returns the new project id.
--
-- p_overrides keys (all optional):
--   name        text      — defaults to request title
--   code        text      — blank/omitted → auto-suggested from name
--   tier        text      — 'small' | 'medium' | 'large'; defaults to 'medium'
--   programme_id uuid     — target programme (requests have no programme)
--   manager_id  uuid      — resource id of the project manager
--   start_date  date text — ISO date string
--   finish_date date text — ISO date string; also used as baseline_finish_date
--   phase_id    uuid      — lifecycle phase; defaults to the org's first phase

create or replace function public.convert_request_to_project(
  p_request_id uuid,
  p_overrides  jsonb default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r         public.project_requests%rowtype;
  p_id      uuid;
  draft     public.request_benefit_drafts%rowtype;
  ben_id    uuid;
  phase_id  uuid;
begin
  -- Step 1: lock the request row to prevent concurrent conversions.
  select * into r
  from public.project_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request % not found', p_request_id using errcode = 'P0002';
  end if;

  -- Explicit permission check for a clear error message (the subsequent DML also enforces
  -- via RLS, but that surfaces as "permission denied for table …").
  if not private.has_workspace_role(r.workspace_id, 'manager') then
    raise exception 'Only workspace managers and above can convert a request to a project'
      using errcode = '42501';
  end if;

  -- Reject requests that have already been converted.
  if exists (
    select 1 from public.projects p where p.converted_from_request_id = p_request_id
  ) then
    raise exception 'Request % has already been converted to a project', p_request_id
      using errcode = '23505';
  end if;

  -- Reject rejected requests.
  if r.status = 'rejected' then
    raise exception 'A rejected request cannot be converted to a project'
      using errcode = '22023';
  end if;

  -- Step 2: approve the request if not yet approved.
  if r.status <> 'approved' then
    update public.project_requests
    set status = 'approved'
    where id = p_request_id;
  end if;

  -- Resolve phase_id: override → org's first phase → null.
  if (p_overrides->>'phase_id') is not null then
    phase_id := (p_overrides->>'phase_id')::uuid;
  else
    select id into phase_id
    from public.lifecycle_phases
    where organisation_id = r.organisation_id
    order by sort_order
    limit 1;
  end if;

  -- Step 3: insert the project.
  --   code: passed through to the trigger private.project_code(), which auto-suggests when blank.
  --   tier: validated to the enum; unknown values fall back to 'medium'.
  --   baseline_finish_date: same as finish_date (the initial forecast is the baseline).
  insert into public.projects (
    organisation_id,
    workspace_id,
    portfolio_id,
    programme_id,
    name,
    code,
    tier,
    priority,
    state,
    start_date,
    finish_date,
    baseline_finish_date,
    manager_id,
    sponsor_id,
    phase_id,
    converted_from_request_id
  ) values (
    r.organisation_id,
    r.workspace_id,
    r.portfolio_id,
    (p_overrides->>'programme_id')::uuid,
    coalesce(nullif(trim(p_overrides->>'name'), ''), r.title),
    coalesce(nullif(trim(p_overrides->>'code'), ''), ''),
    coalesce(
      (case when (p_overrides->>'tier') in ('small','medium','large')
            then (p_overrides->>'tier')::public.project_tier end),
      'medium'
    ),
    r.priority,
    'active',
    (p_overrides->>'start_date')::date,
    (p_overrides->>'finish_date')::date,
    (p_overrides->>'finish_date')::date,
    (p_overrides->>'manager_id')::uuid,
    r.sponsor_id,
    phase_id,
    p_request_id
  )
  returning id into p_id;

  -- Step 4: convert benefit drafts.
  --   Each draft becomes a benefit + benefit_projects link.
  --   If the draft has a strategic_objective_id, a benefit_objectives row is added.
  --   If the draft has a non-empty 'measure' text, a benefit_measures row is added
  --     with that text as the measure name (baseline_value defaults to 0 — the original
  --     was free text so no numeric parse is attempted).
  for draft in
    select * from public.request_benefit_drafts
    where request_id = p_request_id
    order by sort_order
  loop
    -- Insert the benefit.
    insert into public.benefits (
      organisation_id,
      workspace_id,
      portfolio_id,
      title,
      classification,
      planned_total_value,
      owner_id,
      category_id
    ) values (
      r.organisation_id,
      r.workspace_id,
      r.portfolio_id,
      draft.title,
      draft.classification,
      draft.annual_value * draft.years_counted,
      draft.owner_id,
      draft.category_id
    )
    returning id into ben_id;

    -- Link the benefit to the new project (100% attribution from this project).
    insert into public.benefit_projects (
      organisation_id,
      workspace_id,
      benefit_id,
      project_id,
      attribution_percent
    ) values (
      r.organisation_id,
      r.workspace_id,
      ben_id,
      p_id,
      100
    );

    -- Link to strategic objective if set.
    if draft.strategic_objective_id is not null then
      insert into public.benefit_objectives (
        organisation_id,
        workspace_id,
        benefit_id,
        strategic_objective_id
      ) values (
        r.organisation_id,
        r.workspace_id,
        ben_id,
        draft.strategic_objective_id
      );
    end if;

    -- Create a measure row if the draft has a measurement description.
    if draft.measure is not null and trim(draft.measure) <> '' then
      insert into public.benefit_measures (
        organisation_id,
        workspace_id,
        benefit_id,
        name,
        baseline_value,
        sort_order
      ) values (
        r.organisation_id,
        r.workspace_id,
        ben_id,
        draft.measure,
        0,
        draft.sort_order
      );
    end if;
  end loop;

  -- Step 5: re-point business cases from the request to the new project.
  --   The check constraint num_nonnulls(request_id, project_id) = 1 is satisfied because
  --   we clear request_id and set project_id in the same UPDATE.
  update public.business_cases
  set project_id = p_id,
      request_id = null
  where request_id = p_request_id;

  -- Step 6: audit log.
  perform private.write_audit(
    r.organisation_id,
    'request.converted',
    'project_requests',
    p_request_id,
    jsonb_build_object(
      'project_id',  p_id,
      'project_code', (select code from public.projects where id = p_id)
    )
  );

  return p_id;
end;
$$;

revoke all on function public.convert_request_to_project(uuid, jsonb) from public, anon;
grant execute on function public.convert_request_to_project(uuid, jsonb) to authenticated;
