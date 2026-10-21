-- Work package 0.3: covering indexes for the business case foreign keys (performance advisor:
-- unindexed_foreign_keys). Proposal: docs/sql/0-3-housekeeping.sql, Part 2.
create index if not exists business_case_benefits_category_org_list_idx
  on public.business_case_benefits (category_id, organisation_id, category_list);
create index if not exists business_case_sections_version_workspace_idx
  on public.business_case_sections (version_id, workspace_id);
create index if not exists business_case_versions_case_workspace_idx
  on public.business_case_versions (business_case_id, workspace_id);
create index if not exists business_case_versions_preferred_option_idx
  on public.business_case_versions (preferred_option_id, id);
