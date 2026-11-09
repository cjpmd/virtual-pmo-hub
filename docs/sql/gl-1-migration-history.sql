-- GL-1 Migration history reconciliation — PROPOSAL, nothing applied.
-- Audit 09/11/2026 against production xvdlmtkzfmbcegkmampz (read-only: list_migrations,
-- supabase_migrations.schema_migrations, pg_proc, pg_catalog).
--
-- ============================================================================ FINDINGS
-- Repo: 90 files. Production history: 90 rows. 85 versions are in both.
--
-- 1. Same SQL, different version (normalised statements identical: comments/whitespace removed):
--      rb10_project_overview         repo 20261103180000  production 20261105163144
--      rb10_project_summary_phases   repo 20261106090000  production 20261106090956
--                                    (production name rb10_project_summary_phase_id_phases)
--      convert_request_to_project    repo 20261106100000  production 20261106140827
--      grant_write_audit             repo 20261106120000  production 20261106143312
--
-- 2. convert_request_fix (20261106142117) is on production with no file. Its recorded statement
--    is one `create or replace function public.convert_request_to_project` (adds programme
--    validation, programme_id on project and benefits, write_audit). Rebuilt byte-for-byte from
--    the recorded statement: md5 78dc6259… matches production, and the function body matches
--    the live function. No grants in it; the earlier migration's grants still apply.
--
-- 3. rb9_fix_create_report (repo 20261105090000): the fix is NOT live. The audit note was
--    wrong. Live public.create_report is byte-equivalent (normalised) to the rb1 version
--    (20261103140000); it has the old nullif(p ->> …, '') calls but not the RB-54
--    nullif(p -> 'blocks', 'null'::jsonb) handling. No production migration contains it.
--    The client works around it (services/reports.ts omits blocks when unset), so nothing is
--    broken today, but supabase/tests/reports_bugfix.sql (RB-54) would fail on production.
--
-- 4. The four UUID-named migrations:
--      20261007211842  get_portfolio_overview gains p_portfolio (drops the 3-arg version)
--      20261007213413  F4 business cases and documents (tables, RLS, templates, seeding trigger)
--      20261007213657  F4 follow-up: business_case_version_rules, submit_business_case, and
--                      vpmo.seeding guards in audit_row_change, capability_rules,
--                      snapshot_on_status_report
--      20261027162328  public.join_demo_as_viewer() RPC
--    Repo files and production statements are identical for all four.
--
-- 5. Not in the audit list:
--    a. 20261012120035_health_current_b.sql line 7 is a stray uncommented line
--       (`create table public.project_health_current" to`), a syntax error: a branch built
--       from the repo fails at this file. supabase/tests/local/run.sh already comments it out
--       in a temporary copy. Production records only a pointer comment for this migration.
--    b. Production history rows that hold a pointer comment instead of SQL (applied in the
--       SQL editor): health_current_b, drain_health_refresh_search_path,
--       decision_edit_and_draft_links, d2_forum_lookups_and_option_history. 0.3's two rows
--       (active_portfolio_milestone_snapshots, get_portfolio_overview) hold no statements.
--       The repo files are the source for all six; the schema check below confirms they
--       match what is live.
--    c. lock_down_rls_auto_enable: the repo file wraps the revoke in a guard for local
--       stacks; production ran the bare revoke. Same effect.
--    d. ~30 other files differ from production's recorded text only in comments/whitespace.
--
-- ============================================================================ PROPOSAL
-- Repo (scoped git mv / one new file, no SQL changes except 5a):
--   git mv 20261103180000_rb10_project_overview.sql        20261105163144_rb10_project_overview.sql
--   git mv 20261106090000_rb10_project_summary_phases.sql  20261106090956_rb10_project_summary_phase_id_phases.sql
--   git mv 20261106100000_convert_request_to_project.sql   20261106140827_convert_request_to_project.sql
--   git mv 20261106120000_grant_write_audit.sql            20261106143312_grant_write_audit.sql
--   add    20261106142117_convert_request_fix.sql (production's recorded statement, verbatim)
--   git mv 20261007211842_777ed864-….sql  20261007211842_get_portfolio_overview_portfolio_filter.sql
--   git mv 20261007213413_babd4b88-….sql  20261007213413_f4_business_cases_documents.sql
--   git mv 20261007213657_a242f5b1-….sql  20261007213657_f4_business_case_rules_seeding_guards.sql
--   git mv 20261027162328_7507e1b7-….sql  20261027162328_join_demo_as_viewer.sql
--   health_current_b.sql: prefix line 7 with "-- " (the one edit to an existing migration;
--     it restores the comment the file was copied from, docs/sql/perf-health-current-b.sql:43)
--     and drop the sed workaround from supabase/tests/local/run.sh.
--   rb9: move out of the history order. Recommended: re-date it as
--     2026111xxxxxxx_rb9_fix_create_report.sql and apply it to production as a new migration
--     (create or replace only, additive) once you approve it, so RB-54 is actually fixed and
--     reports_bugfix.sql passes. Alternative: move it to docs/sql/ as pending.
--
-- Production history: only the four descriptive names below (Section A). Versions already
-- match after the repo renames, so nothing else in schema_migrations changes.
--
-- ============================================================================ VERIFICATION
-- Done locally (Postgres 16, supabase/tests/local shim + a stub cron schema) on a scratch
-- copy with the proposal applied: all 90 migrations apply from empty. A fingerprint of
-- public/private (and storage policies) then matches production exactly:
--   functions 295 (body, security definer, config, volatility, result type) and their grants
--   to PUBLIC/anon/authenticated/service_role; columns of 174 tables/views; 997 constraints;
--   907 indexes; 27 views; 441 policies; 348 triggers; RLS flags on 147 tables; 63 enums.
-- The 8 production cron jobs are all scheduled by repo migrations (checked by reading; the
-- stub can't run the guarded ones). Spot checks: create_report = rb1 version on both sides,
-- rb_project_summary and convert_request_to_project identical.
-- After merge, the "done when" check on a fresh Supabase branch: list_migrations equals
-- production's list, and the same fingerprint query returns the same hashes.

-- ============================================================================ SECTION A
-- Run in the SQL editor (UPDATE only; nothing is dropped or deleted). Renames the four
-- UUID-named history rows to match the renamed repo files. Fails and rolls back unless
-- exactly four rows change.
do $$
declare
  n int;
begin
  update supabase_migrations.schema_migrations m
  set name = v.new_name
  from (values
    ('20261007211842', '777ed864-4bc1-453a-aedf-487f3b293af3', 'get_portfolio_overview_portfolio_filter'),
    ('20261007213413', 'babd4b88-6ace-41f2-aa98-450a08ba35f8', 'f4_business_cases_documents'),
    ('20261007213657', 'a242f5b1-a0fa-418f-8ca1-4dddcbb9b39c', 'f4_business_case_rules_seeding_guards'),
    ('20261027162328', '7507e1b7-2ce9-4113-b216-87903d310041', 'join_demo_as_viewer')
  ) as v(version, old_name, new_name)
  where m.version = v.version and m.name = v.old_name;
  get diagnostics n = row_count;
  if n <> 4 then
    raise exception 'expected 4 rows renamed, got %', n;
  end if;
end $$;
