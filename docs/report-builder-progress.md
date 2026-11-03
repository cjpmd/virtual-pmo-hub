# Report builder — progress

Read first after a restart: `docs/report-builder-spec.md`, `docs/report-builder-decisions.md`,
this file. Local DB: `supabase/tests/local/run.sh all` (init, migrate, seed, SQL tests);
types: `supabase/tests/local/gen-types.sh`.

## Current phase

Phase 2 — done. Next: Phase 3.

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

## Next steps

- Phase 3: lifecycle RPCs and review UI, report_snapshots / report_metric_snapshots with
  immutability triggers, publish_report + report-publish edge function, snapshot viewer,
  changes_since_last and movement markers, raid_movement, presentation capture (decisions,
  actions), report-distribute (Resend, idempotent), data_quality by cycle, server PDF
  (Netlify function behind REPORT_SERVER_PDF), E2E spec.

## Known issues

- Browser E2E can't run here (RB-25); run `e2e/reports.e2e.ts` on a seeded Supabase branch.
