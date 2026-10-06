-- RLS without per-row helper calls.
--
-- Every policy used to call security-definer helpers (is_workspace_member, has_org_role,
-- can_edit_project, ...) once per row. Through the health views that is thousands of calls
-- per query: 8.4 s for the demo organisation's v_project_health as a signed-in admin, against
-- 190 ms with RLS bypassed. The helpers below return the caller's ids as an array; policies
-- wrap them in a scalar sub-select, `col = any ((select private.my_workspace_ids())::uuid[])`, so
-- Postgres evaluates each once per statement (an initplan) and checks rows against the array.
-- (The ::uuid[] cast matters: without it, any ((select ...)) is parsed as a row sub-query.)
--
-- Semantics are unchanged (verified with supabase/tests/rls_matrix.sql before and after):
--   my_workspace_ids(min_role)  effective workspace role >= min_role: workspace membership, or
--                               organisation pmo/admin (which act in every workspace)
--   my_org_ids(min_role)        organisation role >= min_role
--   my_editable_project_ids()   can_edit_project: not archived, contributor+ in its workspace
--   my_resource_ids()           is_own_resource: resources linked to the caller's profile
--   my_colleague_ids()          shares_org_with: profiles in any of the caller's organisations
-- The per-row helpers stay for RPCs and triggers that check a single row.

create function private.my_org_ids(min_role public.app_role default 'viewer')
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.organisation_id), '{}')
  from public.organisation_members m
  where m.profile_id = (select auth.uid()) and m.role >= min_role;
$$;

create function private.my_workspace_ids(min_role public.app_role default 'viewer')
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.workspace_id), '{}')
  from (
    select wm.workspace_id from public.workspace_members wm
    where wm.profile_id = (select auth.uid()) and wm.role >= min_role
    union all
    select w.id from public.workspaces w
    join public.organisation_members om on om.organisation_id = w.organisation_id
    where om.profile_id = (select auth.uid()) and om.role >= 'pmo' and om.role >= min_role
  ) x;
$$;

create function private.my_editable_project_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.id), '{}')
  from public.projects p
  where p.archived_at is null
    and p.workspace_id = any (private.my_workspace_ids('contributor'));
$$;

create function private.my_resource_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id), '{}') from public.resources r where r.profile_id = (select auth.uid());
$$;

create function private.my_colleague_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct theirs.profile_id), '{}')
  from public.organisation_members mine
  join public.organisation_members theirs on theirs.organisation_id = mine.organisation_id
  where mine.profile_id = (select auth.uid());
$$;

revoke all on function private.my_org_ids(public.app_role), private.my_workspace_ids(public.app_role),
  private.my_editable_project_ids(), private.my_resource_ids(), private.my_colleague_ids() from public, anon;
grant execute on function private.my_org_ids(public.app_role), private.my_workspace_ids(public.app_role),
  private.my_editable_project_ids(), private.my_resource_ids(), private.my_colleague_ids() to authenticated, service_role;

-- ---- Policies (generated from pg_policies; each helper call replaced by its array form) ----
alter policy "assumptions_delete" on public.assumptions
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "assumptions_insert" on public.assumptions
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "assumptions_select" on public.assumptions
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "assumptions_update" on public.assumptions
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END))
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "audit_log_select" on public.audit_log
  using (
CASE
    WHEN (workspace_id IS NULL) THEN (organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[]))
    ELSE (workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[]))
END);
alter policy "benefit_handovers_delete" on public.benefit_handovers
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "benefit_handovers_insert" on public.benefit_handovers
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_handovers_select" on public.benefit_handovers
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefit_handovers_update" on public.benefit_handovers
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_maps_delete" on public.benefit_maps
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "benefit_maps_insert" on public.benefit_maps
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_maps_select" on public.benefit_maps
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefit_maps_update" on public.benefit_maps
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_measure_targets_delete" on public.benefit_measure_targets
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_measure_targets_insert" on public.benefit_measure_targets
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_measure_targets_select" on public.benefit_measure_targets
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefit_measure_targets_update" on public.benefit_measure_targets
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_measurements_delete" on public.benefit_measurements
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "benefit_measurements_insert" on public.benefit_measurements
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_measurements_select" on public.benefit_measurements
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefit_measurements_update" on public.benefit_measurements
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_measures_delete" on public.benefit_measures
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "benefit_measures_insert" on public.benefit_measures
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_measures_select" on public.benefit_measures
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefit_measures_update" on public.benefit_measures
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_objectives_delete" on public.benefit_objectives
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_objectives_insert" on public.benefit_objectives
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_objectives_select" on public.benefit_objectives
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefit_periods_delete" on public.benefit_periods
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "benefit_periods_insert" on public.benefit_periods
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "benefit_periods_select" on public.benefit_periods
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "benefit_periods_update" on public.benefit_periods
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "benefit_projects_delete" on public.benefit_projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_projects_insert" on public.benefit_projects
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_projects_select" on public.benefit_projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefit_projects_update" on public.benefit_projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_reviews_delete" on public.benefit_reviews
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "benefit_reviews_insert" on public.benefit_reviews
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefit_reviews_select" on public.benefit_reviews
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefit_reviews_update" on public.benefit_reviews
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefits_delete" on public.benefits
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "benefits_insert" on public.benefits
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "benefits_select" on public.benefits
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "benefits_update" on public.benefits
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "capabilities_delete" on public.capabilities
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "capabilities_insert" on public.capabilities
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "capabilities_select" on public.capabilities
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "capabilities_update" on public.capabilities
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "capability_projects_delete" on public.capability_projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "capability_projects_insert" on public.capability_projects
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "capability_projects_select" on public.capability_projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "change_requests_delete" on public.change_requests
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "change_requests_insert" on public.change_requests
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "change_requests_select" on public.change_requests
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "change_requests_update" on public.change_requests
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END))
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "collection_projects_delete" on public.collection_projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "collection_projects_insert" on public.collection_projects
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "collection_projects_select" on public.collection_projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "collection_projects_update" on public.collection_projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "collections_delete" on public.collections
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "collections_insert" on public.collections
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "collections_select" on public.collections
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "collections_update" on public.collections
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "committee_packs_insert" on public.committee_packs
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "committee_packs_select" on public.committee_packs
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "committee_packs_update" on public.committee_packs
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "decision_actions_delete" on public.decision_actions
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_actions_insert" on public.decision_actions
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_actions_select" on public.decision_actions
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "decision_actions_update" on public.decision_actions
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END))
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_benefits_delete" on public.decision_benefits
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_benefits_insert" on public.decision_benefits
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_benefits_select" on public.decision_benefits
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "decision_change_requests_delete" on public.decision_change_requests
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_change_requests_insert" on public.decision_change_requests
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_change_requests_select" on public.decision_change_requests
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "decision_dependencies_delete" on public.decision_dependencies
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_dependencies_insert" on public.decision_dependencies
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_dependencies_select" on public.decision_dependencies
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "decision_issues_delete" on public.decision_issues
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_issues_insert" on public.decision_issues
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_issues_select" on public.decision_issues
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "decision_options_delete" on public.decision_options
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_options_insert" on public.decision_options
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_options_select" on public.decision_options
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "decision_options_update" on public.decision_options
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END))
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_risks_delete" on public.decision_risks
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_risks_insert" on public.decision_risks
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decision_risks_select" on public.decision_risks
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "decisions_delete" on public.decisions
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "decisions_insert" on public.decisions
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "decisions_select" on public.decisions
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "decisions_update" on public.decisions
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END))
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "dependencies_delete" on public.dependencies
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "dependencies_insert" on public.dependencies
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "dependencies_select" on public.dependencies
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "dependencies_update" on public.dependencies
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "dependency_issues_delete" on public.dependency_issues
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "dependency_issues_insert" on public.dependency_issues
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "dependency_issues_select" on public.dependency_issues
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "dependency_risks_delete" on public.dependency_risks
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "dependency_risks_insert" on public.dependency_risks
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "dependency_risks_select" on public.dependency_risks
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "exchange_rates_delete" on public.exchange_rates
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "exchange_rates_insert" on public.exchange_rates
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "exchange_rates_select" on public.exchange_rates
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "exchange_rates_update" on public.exchange_rates
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "gate_criteria_delete" on public.gate_criteria
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "gate_criteria_insert" on public.gate_criteria
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "gate_criteria_select" on public.gate_criteria
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "gate_criteria_update" on public.gate_criteria
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "health_snapshots_select" on public.health_snapshots
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "holiday_calendars_delete" on public.holiday_calendars
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "holiday_calendars_insert" on public.holiday_calendars
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "holiday_calendars_select" on public.holiday_calendars
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "holiday_calendars_update" on public.holiday_calendars
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "holiday_dates_delete" on public.holiday_dates
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "holiday_dates_insert" on public.holiday_dates
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "holiday_dates_select" on public.holiday_dates
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "holiday_dates_update" on public.holiday_dates
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "improvement_actions_delete" on public.improvement_actions
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "improvement_actions_insert" on public.improvement_actions
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "improvement_actions_select" on public.improvement_actions
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "improvement_actions_update" on public.improvement_actions
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "issues_delete" on public.issues
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "issues_insert" on public.issues
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "issues_select" on public.issues
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "issues_update" on public.issues
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END))
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "lesson_project_types_delete" on public.lesson_project_types
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "lesson_project_types_insert" on public.lesson_project_types
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "lesson_project_types_select" on public.lesson_project_types
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "lessons_delete" on public.lessons
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "lessons_insert" on public.lessons
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "lessons_select" on public.lessons
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "lessons_update" on public.lessons
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "lifecycle_phases_delete" on public.lifecycle_phases
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "lifecycle_phases_insert" on public.lifecycle_phases
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "lifecycle_phases_select" on public.lifecycle_phases
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "lifecycle_phases_update" on public.lifecycle_phases
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "lookup_values_delete" on public.lookup_values
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "lookup_values_insert" on public.lookup_values
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "lookup_values_select" on public.lookup_values
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "lookup_values_update" on public.lookup_values
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "milestone_forecast_history_select" on public.milestone_forecast_history
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "milestones_delete" on public.milestones
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "milestones_insert" on public.milestones
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "milestones_select" on public.milestones
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "milestones_update" on public.milestones
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "ms_connections_delete" on public.ms_connections
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "ms_connections_insert" on public.ms_connections
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "ms_connections_select" on public.ms_connections
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "ms_connections_update" on public.ms_connections
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "organisation_members_delete" on public.organisation_members
  using ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])));
alter policy "organisation_members_insert" on public.organisation_members
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])));
alter policy "organisation_members_select" on public.organisation_members
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "organisation_members_update" on public.organisation_members
  using ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])));
alter policy "organisation_subscriptions_select" on public.organisation_subscriptions
  using ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])));
alter policy "organisations_select" on public.organisations
  using ((id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "organisations_update" on public.organisations
  using ((id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "outcome_benefits_delete" on public.outcome_benefits
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "outcome_benefits_insert" on public.outcome_benefits
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "outcome_benefits_select" on public.outcome_benefits
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "outcome_capabilities_delete" on public.outcome_capabilities
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "outcome_capabilities_insert" on public.outcome_capabilities
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "outcome_capabilities_select" on public.outcome_capabilities
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "outcomes_delete" on public.outcomes
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "outcomes_insert" on public.outcomes
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "outcomes_select" on public.outcomes
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "outcomes_update" on public.outcomes
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])));
alter policy "phase_lessons_review_attendees_delete" on public.phase_lessons_review_attendees
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "phase_lessons_review_attendees_insert" on public.phase_lessons_review_attendees
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "phase_lessons_review_attendees_select" on public.phase_lessons_review_attendees
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "phase_lessons_reviews_delete" on public.phase_lessons_reviews
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "phase_lessons_reviews_insert" on public.phase_lessons_reviews
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "phase_lessons_reviews_select" on public.phase_lessons_reviews
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "phase_lessons_reviews_update" on public.phase_lessons_reviews
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "portfolios_insert" on public.portfolios
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "portfolios_select" on public.portfolios
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "portfolios_update" on public.portfolios
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "profiles_select" on public.profiles
  using (((id = ( SELECT auth.uid() AS uid)) OR (id = ANY ((SELECT private.my_colleague_ids())::uuid[]))));
alter policy "programmes_insert" on public.programmes
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "programmes_select" on public.programmes
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "programmes_update" on public.programmes
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "project_buckets_delete" on public.project_buckets
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "project_buckets_insert" on public.project_buckets
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "project_buckets_select" on public.project_buckets
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "project_buckets_update" on public.project_buckets
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "project_plan_links_delete" on public.project_plan_links
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "project_plan_links_insert" on public.project_plan_links
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "project_plan_links_select" on public.project_plan_links
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "project_plan_links_update" on public.project_plan_links
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "project_requests_delete" on public.project_requests
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "project_requests_insert" on public.project_requests
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "project_requests_select" on public.project_requests
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "project_requests_update" on public.project_requests
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "project_team_members_delete" on public.project_team_members
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "project_team_members_insert" on public.project_team_members
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "project_team_members_select" on public.project_team_members
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "project_team_members_update" on public.project_team_members
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "project_templates_delete" on public.project_templates
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "project_templates_insert" on public.project_templates
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "project_templates_select" on public.project_templates
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "project_templates_update" on public.project_templates
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "projects_insert" on public.projects
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "projects_select" on public.projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "projects_update" on public.projects
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "request_benefit_drafts_delete" on public.request_benefit_drafts
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "request_benefit_drafts_insert" on public.request_benefit_drafts
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "request_benefit_drafts_select" on public.request_benefit_drafts
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "request_benefit_drafts_update" on public.request_benefit_drafts
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "resource_assignments_delete" on public.resource_assignments
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "resource_assignments_insert" on public.resource_assignments
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "resource_assignments_select" on public.resource_assignments
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "resource_assignments_update" on public.resource_assignments
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "resource_leave_delete" on public.resource_leave
  using (((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])) OR (resource_id = ANY ((SELECT private.my_resource_ids())::uuid[]))));
alter policy "resource_leave_insert" on public.resource_leave
  with check (((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])) OR (resource_id = ANY ((SELECT private.my_resource_ids())::uuid[]))));
alter policy "resource_leave_select" on public.resource_leave
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "resource_leave_update" on public.resource_leave
  using (((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])) OR (resource_id = ANY ((SELECT private.my_resource_ids())::uuid[]))))
  with check (((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])) OR (resource_id = ANY ((SELECT private.my_resource_ids())::uuid[]))));
alter policy "resource_skills_delete" on public.resource_skills
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "resource_skills_insert" on public.resource_skills
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "resource_skills_select" on public.resource_skills
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "resource_skills_update" on public.resource_skills
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "resources_delete" on public.resources
  using ((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])));
alter policy "resources_insert" on public.resources
  with check (((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])) OR (is_placeholder AND (organisation_id = ANY ((SELECT private.my_org_ids('manager'::public.app_role))::uuid[])))));
alter policy "resources_select" on public.resources
  using ((organisation_id = ANY ((SELECT private.my_org_ids())::uuid[])));
alter policy "resources_update" on public.resources
  using (((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])) OR (is_placeholder AND (organisation_id = ANY ((SELECT private.my_org_ids('manager'::public.app_role))::uuid[])))))
  with check (((organisation_id = ANY ((SELECT private.my_org_ids('pmo'::public.app_role))::uuid[])) OR (is_placeholder AND (organisation_id = ANY ((SELECT private.my_org_ids('manager'::public.app_role))::uuid[])))));
alter policy "risks_delete" on public.risks
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "risks_insert" on public.risks
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "risks_select" on public.risks
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "risks_update" on public.risks
  using ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END))
  with check ((CASE WHEN project_id IS NULL THEN workspace_id = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[]) ELSE project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[]) END));
alter policy "roadmap_item_collections_delete" on public.roadmap_item_collections
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_item_collections_insert" on public.roadmap_item_collections
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_item_collections_select" on public.roadmap_item_collections
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "roadmap_item_collections_update" on public.roadmap_item_collections
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_items_delete" on public.roadmap_items
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_items_insert" on public.roadmap_items
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_items_select" on public.roadmap_items
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "roadmap_items_update" on public.roadmap_items
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_key_dates_delete" on public.roadmap_key_dates
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_key_dates_insert" on public.roadmap_key_dates
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_key_dates_select" on public.roadmap_key_dates
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "roadmap_key_dates_update" on public.roadmap_key_dates
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_rows_delete" on public.roadmap_rows
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_rows_insert" on public.roadmap_rows
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmap_rows_select" on public.roadmap_rows
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "roadmap_rows_update" on public.roadmap_rows
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmaps_delete" on public.roadmaps
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmaps_insert" on public.roadmaps
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "roadmaps_select" on public.roadmaps
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "roadmaps_update" on public.roadmaps
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "status_reports_delete" on public.status_reports
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])));
alter policy "status_reports_insert" on public.status_reports
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "status_reports_select" on public.status_reports
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "status_reports_update" on public.status_reports
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "strategic_objectives_delete" on public.strategic_objectives
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "strategic_objectives_insert" on public.strategic_objectives
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "strategic_objectives_select" on public.strategic_objectives
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "strategic_objectives_update" on public.strategic_objectives
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "sync_conflicts_delete" on public.sync_conflicts
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "sync_conflicts_insert" on public.sync_conflicts
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "sync_conflicts_select" on public.sync_conflicts
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "sync_conflicts_update" on public.sync_conflicts
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "sync_log_insert" on public.sync_log
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "sync_log_select" on public.sync_log
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "sync_outbox_delete" on public.sync_outbox
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "sync_outbox_insert" on public.sync_outbox
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "sync_outbox_select" on public.sync_outbox
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "sync_outbox_update" on public.sync_outbox
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "user_favourites_insert" on public.user_favourites
  with check (((profile_id = ( SELECT auth.uid() AS uid)) AND (organisation_id = ANY ((SELECT private.my_org_ids())::uuid[]))));
alter policy "work_item_assignees_delete" on public.work_item_assignees
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_assignees_insert" on public.work_item_assignees
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_assignees_select" on public.work_item_assignees
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "work_item_attachments_delete" on public.work_item_attachments
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_attachments_insert" on public.work_item_attachments
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_attachments_select" on public.work_item_attachments
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "work_item_attachments_update" on public.work_item_attachments
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_checklist_items_delete" on public.work_item_checklist_items
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_checklist_items_insert" on public.work_item_checklist_items
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_checklist_items_select" on public.work_item_checklist_items
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "work_item_checklist_items_update" on public.work_item_checklist_items
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_events_select" on public.work_item_events
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "work_item_links_delete" on public.work_item_links
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_links_insert" on public.work_item_links
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_links_select" on public.work_item_links
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "work_item_offers_insert" on public.work_item_offers
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_item_offers_select" on public.work_item_offers
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "work_item_offers_update" on public.work_item_offers
  using (((response IS NULL) AND (issued_to = ANY ((SELECT private.my_resource_ids())::uuid[]) OR issued_by = ANY ((SELECT private.my_resource_ids())::uuid[]) OR workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[]))))
  with check ((issued_to = ANY ((SELECT private.my_resource_ids())::uuid[]) OR issued_by = ANY ((SELECT private.my_resource_ids())::uuid[]) OR workspace_id = ANY ((SELECT private.my_workspace_ids('pmo'::public.app_role))::uuid[])));
alter policy "work_items_insert" on public.work_items
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "work_items_select" on public.work_items
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "work_items_update" on public.work_items
  using ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])))
  with check ((project_id = ANY ((SELECT private.my_editable_project_ids())::uuid[])));
alter policy "workspace_members_delete" on public.workspace_members
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('admin'::public.app_role))::uuid[])));
alter policy "workspace_members_insert" on public.workspace_members
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('admin'::public.app_role))::uuid[])));
alter policy "workspace_members_select" on public.workspace_members
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "workspace_members_update" on public.workspace_members
  using ((workspace_id = ANY ((SELECT private.my_workspace_ids('admin'::public.app_role))::uuid[])))
  with check ((workspace_id = ANY ((SELECT private.my_workspace_ids('admin'::public.app_role))::uuid[])));
alter policy "workspaces_delete" on public.workspaces
  using ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])));
alter policy "workspaces_insert" on public.workspaces
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])));
alter policy "workspaces_select" on public.workspaces
  using ((id = ANY ((SELECT private.my_workspace_ids())::uuid[])));
alter policy "workspaces_update" on public.workspaces
  using ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])))
  with check ((organisation_id = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[])));
alter policy "vpmo_objects_delete" on storage.objects
  using ((((bucket_id = 'org-assets'::text) AND (private.try_uuid((storage.foldername(name))[1]) = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[]))) OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND (private.storage_workspace(name) = ANY ((SELECT private.my_workspace_ids('manager'::public.app_role))::uuid[])))));
alter policy "vpmo_objects_insert" on storage.objects
  with check ((((bucket_id = 'org-assets'::text) AND (private.try_uuid((storage.foldername(name))[1]) = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[]))) OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND (private.storage_workspace(name) = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))));
alter policy "vpmo_objects_select" on storage.objects
  using ((((bucket_id = 'org-assets'::text) AND (private.try_uuid((storage.foldername(name))[1]) = ANY ((SELECT private.my_org_ids())::uuid[]))) OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND (private.storage_workspace(name) = ANY ((SELECT private.my_workspace_ids())::uuid[])))));
alter policy "vpmo_objects_update" on storage.objects
  using ((((bucket_id = 'org-assets'::text) AND (private.try_uuid((storage.foldername(name))[1]) = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[]))) OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND (private.storage_workspace(name) = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))))
  with check ((((bucket_id = 'org-assets'::text) AND (private.try_uuid((storage.foldername(name))[1]) = ANY ((SELECT private.my_org_ids('admin'::public.app_role))::uuid[]))) OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND (private.storage_workspace(name) = ANY ((SELECT private.my_workspace_ids('contributor'::public.app_role))::uuid[])))));
