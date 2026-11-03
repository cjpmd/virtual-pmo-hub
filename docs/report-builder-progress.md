# Report builder — progress

Read first after a restart: `docs/report-builder-spec.md`, `docs/report-builder-decisions.md`,
this file. Local DB: `supabase/tests/local/run.sh all` (init, migrate, seed, SQL tests);
types: `supabase/tests/local/gen-types.sh`.

## Current phase

Phase 1 — done. Next: Phase 2.

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

## Next steps

- Phase 2: remaining metrics (escalations), forum_actions, escalation columns, Phase 2 blocks,
  Programme and Portfolio templates, nhs_assurance, partner rendering, gate editor,
  SQL parity test for selection cases.

## Known issues

- Browser E2E can't run here (RB-25); run `e2e/reports.e2e.ts` on a seeded Supabase branch.
