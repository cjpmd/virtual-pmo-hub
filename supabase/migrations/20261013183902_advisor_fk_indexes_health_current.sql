-- Covering indexes for the workspace foreign keys on the stored health tables (performance
-- advisor: unindexed_foreign_keys). Proposal: docs/sql/advisor-fixes-drain-search-path-fk-indexes.sql.
create index if not exists project_health_current_project_workspace_idx
  on public.project_health_current (project_id, workspace_id);
create index if not exists programme_health_current_programme_workspace_idx
  on public.programme_health_current (programme_id, workspace_id);
create index if not exists portfolio_health_current_portfolio_workspace_idx
  on public.portfolio_health_current (portfolio_id, workspace_id);
