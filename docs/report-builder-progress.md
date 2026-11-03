# Report builder — progress

Read first after a restart: `docs/report-builder-spec.md`, `docs/report-builder-decisions.md`,
this file. Local DB: `supabase/tests/local/run.sh all` (init, migrate, seed, SQL tests);
types: `supabase/tests/local/gen-types.sh`.

## Current phase

Follow-up run (04/11/2026): Part A done; Part B stopped (no `.env.local`, RB-45); Part C done. See `docs/report-builder-handover.md`.

## Completed

- Phase 0: mapping note (`docs/report-builder-mapping.md`), decisions log, local Postgres runner
  and type generator.

- Phase 1: migration `20261103140000_rb1_report_builder_foundations.sql` (config, forums,
  templates, reports, inclusions, narratives, events, gates, links, shares, RLS helpers,
  project_metrics, selection engine, create_report, Phase 1 block functions, Project Board
  template, report_permissions); demo seed `supabase/seed/reports_demo.sql`; SQL/RLS tests
  `supabase/tests/reports_phase1.sql`; block registry, 14 Phase 1 blocks, builder (library,
  drag and drop canvas, inspector, selection panel, autosave), template builder, viewer,
  print route + print CSS, presentation mode shell, forum report settings and packs in Boards,
  routes under /governance/reports; unit tests (rule engine) and component tests (blocks).

- Phase 2: migration `20261103150000_rb2_selection_programme_packs.sql` (escalations,
  forum_actions, nhs_assurance, default tolerances, metrics wrapper, 18 block functions,
  Programme Board and Portfolio Board / Committee templates); seed extended (escalation,
  dependencies, bookings, benefit, request, work items, approval gate, action); SQL tests
  `supabase/tests/reports_phase2.sql` (parity with `selection-cases.json`, inclusions and
  reasons, tolerance refresh, overrides, capping, NHS relabelling, partner RLS, actions RLS);
  18 block renderers (SVG charts), gate editor and escalations panel on the project page;
  component tests for Phase 2 fixtures.

- Phase 3: migration `20261103160000_rb3_governance_snapshots.sql` (snapshots and metric
  snapshots with immutability triggers and partner-aware RLS, lifecycle RPCs, atomic
  publish_report, changes_since_last / raid_movement data, decisions_taken fix, meeting capture
  RPCs, distribution list, print tokens, report-pdfs bucket); seed publishes a previous pack
  from wound-back data; SQL tests `reports_phase3.sql` (lifecycle permissions, snapshots frozen
  after edits, immutability, second pack changes, decisions reach the next pack, distribution
  idempotency and recipients, print tokens, partner snapshot filtering); diff engine + tests;
  snapshot viewer with movement markers; lifecycle actions and history; presentation drawer
  (decisions, actions); public print route; edge functions `report-publish`,
  `report-distribute` with a tested shared module; Netlify `report-pdf` behind the flag; E2E
  spec `e2e/reports.e2e.ts` (branch only); print verified to PDF locally.

- Phase 4: migration `20261103170000_rb4_enhancements.sql` (record_ai_draft,
  acknowledge_ai_draft, ai_drafts_today, update_report_to_template, forums.auto_create_packs
  + daily create_scheduled_packs job, lessons_learned and linked_records functions,
  v_record_links resolving milestone ends); SQL tests `reports_phase4.sql`; edge function
  `report-ai-summary` with a tested prompt module; Draft with AI / Mark reviewed, template
  version and update, auto-draft toggle, Links panel, two new blocks with component tests.
  PPTX deferred (RB-40).

- Follow-up Part A (04/11/2026): migration `20261104090000_rb5_visibility_history_guards.sql`
  — A1 `forums.published_pack_visibility` and new `can_view_report` (members / organisation;
  ad hoc to creator + PMO); A2 `project_metric_history` + nightly capture (02:40 UTC),
  `project_metrics` uses history for past as-at with `_basis`, `report_data_basis`, cover /
  viewer / print note, `__basis` snapshot at publish, history fallback in changes_since_last;
  A3 org-default matrix guard, `forums.risk_matrix_id`, `report_templates.risk_matrix_key`;
  A7 system creator marker, `report_notifications` outbox, `report-notify` edge function,
  "Draft pack ready" in the bell. A4 Chromium deps pinned and bundled with Netlify's bundler;
  A5 `ANTHROPIC_MODEL=claude-sonnet-5-5`; A6 "Funding packs" in the UI; A8 debt logged.
  SQL tests `reports_phase5.sql`; Phase 1 matrix test updated to the guard.
- Part B: not run — no `.env.local` (no branch credentials) and no Docker for a local Supabase
  stack. Stopped per the instruction (RB-45); nothing touched any hosted project.

- 04/11/2026 (second follow-up): server PDF on `@sparticuz/chromium-min` with the pack from
  `REPORT_CHROMIUM_PACK_URL`, its deps in `netlify/functions/package.json` (removed from the
  root); migration `20261104120000_rb6_report_notify_cron.sql` (pg_cron + pg_net job, Vault
  secrets) with `supabase/tests/reports_phase6.sql`. Part B against the test project blocked:
  no credentials in this session (RB-46).

## Next steps

- Provide branch credentials in `.env.local` and run Part B (handover §5): apply the five
  migrations, regenerate types with the CLI and diff, seed with passwords, SQL/RLS suites with
  real auth, deploy the four report functions, publish checks, E2E, manual cycle.

## Known issues

- Part B not run: no credentials in the session (RB-45, RB-46).

- Browser E2E can't run here (RB-25); run `e2e/reports.e2e.ts` on a seeded Supabase branch.
- Edge functions (`report-publish`, `report-distribute`) and the Netlify `report-pdf` function
  are unit-tested through their shared module but not run end to end (no Deno / Netlify here).
