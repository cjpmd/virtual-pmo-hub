-- Work package 0.3: database housekeeping. PROPOSAL, not yet applied.
--
-- Findings (live project xvdlmtkzfmbcegkmampz, 21/10/2026)
--
-- Migration history. supabase_migrations.schema_migrations has 63 rows; supabase/migrations has
-- 65 files. The only files missing from the history are the two known ones:
--   20261007131500_active_portfolio_milestone_snapshots
--   20261007150000_get_portfolio_overview
-- Nothing is in the history without a file, and every other version and name matches.
--
-- Live functions compared with the files (bodies compared with comments stripped, whitespace
-- collapsed and case folded):
--   public.get_portfolio_overview
--     20261007150000 creates the 3-argument (uuid, uuid, text) version. It no longer exists:
--     20261007211842 drops it and creates the 4-argument version, and 20261013210653
--     (health_reads_stored) replaces that. The live 4-argument function matches 20261013210653
--     exactly, with grants as in the file (authenticated, service_role). No difference.
--   private.capture_health_snapshots
--     Live does NOT match 20261007131500 (or the earlier 20261007083935). Differences:
--     1. 20261007131500 declares `c integer` and adds `get diagnostics c = row_count; n := n + c;`
--        after each of the three inserts. Live has neither, so it returns only the count from
--        capture_pathway_snapshots and leaves out the health snapshot rows.
--     2. milestonesDue30: the file uses `forecast_date between today and today + 30`, live uses
--        `>= today and <= today + 30`. These are the same.
--     3. Comments differ.
--     Security definer, search_path and grants (postgres, service_role only) match the file.
--     Both callers ignore the return value (the nightly cron `select` and `perform` in the
--     status-report trigger), so the only behaviour difference is the returned count.
--
-- Unindexed foreign keys (public schema; checked against pg_index, not only the advisor): exactly
-- the four named in the build plan, and no others.
--
-- Three parts. Parts 1 and 2 are what the build plan asks for. Part 3 is optional and needs your
-- decision.

-- ---------------------------------------------------------------------------------------------
-- Part 1: record the two hand-applied migrations in the history. No schema change.
-- Run once in the SQL editor (not as a migration). This matches what
-- `supabase migration repair --status applied <version>` writes: version and name, no statements.
-- ---------------------------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261007131500', 'active_portfolio_milestone_snapshots'),
  ('20261007150000', 'get_portfolio_overview')
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Part 2: new migration supabase/migrations/<timestamp>_0_3_business_case_fk_indexes.sql
-- Covering indexes for the unindexed foreign keys (performance advisor:
-- unindexed_foreign_keys). Column order matches each foreign key. The business case tables are
-- small, so plain (non-concurrent) creation inside the migration's transaction is fine.
-- ---------------------------------------------------------------------------------------------
create index if not exists business_case_benefits_category_org_list_idx
  on public.business_case_benefits (category_id, organisation_id, category_list);
create index if not exists business_case_sections_version_workspace_idx
  on public.business_case_sections (version_id, workspace_id);
create index if not exists business_case_versions_case_workspace_idx
  on public.business_case_versions (business_case_id, workspace_id);
create index if not exists business_case_versions_preferred_option_idx
  on public.business_case_versions (preferred_option_id, id);

-- ---------------------------------------------------------------------------------------------
-- Part 3 (OPTIONAL, your call): make the live capture_health_snapshots match its migration file.
-- Today a fresh rebuild from supabase/migrations would produce the file's version, not the live
-- one. Two ways to close that:
--   (a) Recommended: a new migration <timestamp>_0_3_capture_health_snapshots_row_counts.sql
--       that re-creates the function exactly as in 20261007131500 (same signature, SECURITY
--       DEFINER, search_path '', revoke from public/anon/authenticated, grant to service_role).
--       Live then matches the files, and the function returns the full row count. No caller
--       uses the count, so nothing else changes.
--   (b) Leave it. Live and a rebuild would differ only in the returned count.
-- The SQL for (a) is the full text of 20261007131500 (lines 5-72); it is not repeated here, and
-- it goes in as a new migration file. Existing migrations are never edited.
-- ---------------------------------------------------------------------------------------------
