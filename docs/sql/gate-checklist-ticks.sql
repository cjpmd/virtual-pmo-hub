-- PROPOSAL (not applied): save gate checklist ticks (before D1, 14/10/2026).
--
-- Today the manual ticks on Plan › Gates (and the "relevant lessons reviewed" tick that the
-- lessons-reviewed criterion reads) live in page state and are lost on reload, so the Overview
-- gate signal counts nothing that was ticked earlier.
--
-- One row per ticked criterion per gate milestone. A tick is a fact (who, when); unticking
-- deletes the row (the audit log keeps the history). No updates.
--   * gate milestone: a milestone of type 'gate' on the same project. Gate milestones carry no
--     phase today (0 of 87 have phase_id), so the app ticks against the project's next
--     undelivered gate milestone, the same one the Overview gate signal already uses.
--   * criterion: a gate_criteria row of the same organisation (manual criteria, and the
--     lessons-reviewed criterion, whose automatic check becomes "a tick exists").
--   * ticked_by / ticked_at: set by the database from the signed-in user and now(), never sent.
--   * RLS: read for workspace members; tick and untick for project members with edit rights
--     (my_editable_project_ids, as milestones and status reports). No update.
--   * Additive only: one new unique key on gate_criteria (id, organisation_id) for the
--     tenant-scoped composite foreign key; no DROP, no DELETE, no data change.

-- Composite key so a tick can only reference its own organisation's criteria.
alter table public.gate_criteria
  add constraint gate_criteria_id_organisation_id_key unique (id, organisation_id);

create table public.gate_checklist_ticks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  milestone_id uuid not null,
  criterion_id uuid not null,
  ticked_by uuid default auth.uid(),
  ticked_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (milestone_id, project_id) references public.milestones (id, project_id) on delete cascade,
  foreign key (criterion_id, organisation_id) references public.gate_criteria (id, organisation_id) on delete cascade,
  foreign key (ticked_by) references public.profiles (id) on delete set null,
  unique (milestone_id, criterion_id)
);
create index gate_checklist_ticks_workspace_idx on public.gate_checklist_ticks (workspace_id, organisation_id);
create index gate_checklist_ticks_organisation_idx on public.gate_checklist_ticks (organisation_id);
create index gate_checklist_ticks_project_idx on public.gate_checklist_ticks (project_id, workspace_id);
create index gate_checklist_ticks_milestone_idx on public.gate_checklist_ticks (milestone_id, project_id);
create index gate_checklist_ticks_criterion_idx on public.gate_checklist_ticks (criterion_id, organisation_id);
create index gate_checklist_ticks_ticked_by_idx on public.gate_checklist_ticks (ticked_by);

create trigger gate_checklist_ticks_00_tenant_guard before insert or update on public.gate_checklist_ticks
  for each row execute function private.tenant_guard('project_id', 'projects');

-- Only gate milestones; who and when come from the database.
create function private.gate_checklist_tick_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.milestones m
    where m.id = new.milestone_id and m.project_id = new.project_id and m.type = 'gate'
  ) then
    raise exception 'Checklist items can only be ticked against a gate milestone of this project.'
      using errcode = '23514';
  end if;
  new.ticked_by := (select auth.uid());
  new.ticked_at := now();
  return new;
end;
$$;
revoke all on function private.gate_checklist_tick_rules() from public, anon, authenticated;
create trigger gate_checklist_ticks_10_rules before insert on public.gate_checklist_ticks
  for each row execute function private.gate_checklist_tick_rules();
create trigger gate_checklist_ticks_audit after insert or update or delete on public.gate_checklist_ticks
  for each row execute function private.audit_row_change();

alter table public.gate_checklist_ticks enable row level security;
revoke all on public.gate_checklist_ticks from anon, authenticated;
grant select, insert, delete on public.gate_checklist_ticks to authenticated;
create policy gate_checklist_ticks_select on public.gate_checklist_ticks for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy gate_checklist_ticks_insert on public.gate_checklist_ticks for insert to authenticated
  with check (project_id = any ((select private.my_editable_project_ids())::uuid[]));
create policy gate_checklist_ticks_delete on public.gate_checklist_ticks for delete to authenticated
  using (project_id = any ((select private.my_editable_project_ids())::uuid[]));

-- DRY RUN (14/10/2026, one transaction, rolled back; member and outsider simulated with their
-- JWT subject and role authenticated):
--   1 member ticks a manual criterion on ARB's next gate      saved; ticked_by = member and
--                                                             ticked_at = now() (client values ignored)
--   2 same tick again                                          refused (unique milestone + criterion)
--   3 tick against a non-gate milestone                        refused (gate milestones only)
--   4 criterion from another organisation                      refused (composite foreign key)
--   5 member reads ticks                                       1 row
--   6 member updates a tick                                    refused (no update grant)
--   7 outsider reads ticks                                     0 rows
--   8 outsider ticks ARB                                       refused (project not visible)
-- After the rollback the table and the new gate_criteria key don't exist.
