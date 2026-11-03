# Report builder — handover

Branch `feature/report-builder` (not merged into `main`). Spec:
`docs/report-builder-spec.md`. Mapping: `docs/report-builder-mapping.md`. Decisions (RB-n):
`docs/report-builder-decisions.md`. Progress log: `docs/report-builder-progress.md`.

Nothing has been applied to the hosted Supabase project. Everything was built and tested
against a throwaway local Postgres 16 with a small Supabase shim (`supabase/tests/local/`), and
`src/integrations/supabase/types.ts` was regenerated from it with postgres-meta (RB-2).

## 1. What was built

### Phase 0 — discovery
- Mapping of every spec concept onto the existing schema: forums, forum members, meetings,
  decisions (+ options, actions), status (highlight) reports, stored health with declared vs
  evidenced, financial views, dependencies, gates and lessons already existed and are reused.
- Local test harness: `supabase/tests/local/run.sh` (init / migrate / seed / test) and
  `gen-types.sh`.

### Phase 1 — foundations and Project Board pack
- Config: `rating_schemes` (RAG), `risk_matrices` (standard 5×5 = today's settings, NHS 5×5),
  `risk_score()` / `risk_band()`, `risks.risk_matrix_id`.
- Forums extended (type, description, scope, scheme, tolerances, default template, parent,
  approval required), member roles, `forum_scope_items`.
- `report_templates`, `reports`, `report_inclusions`, `report_narratives`, `report_events`,
  `decisions.report_id` / `decided_meeting_id`, `approval_gates` / `approval_steps`,
  `record_links` (+ `v_record_links`), `entity_shares`.
- RLS helpers (`can_view_entity`, `forum_role_of`, `can_edit_report`, `can_view_report`,
  approve / publish checks) and policies; `report_permissions()`.
- `project_metrics()` (all §7.1 metrics), selection engine in SQL (`evaluate_selection`,
  `compute_inclusions`), `create_report`, `refresh_report_selection`, pin / exclude / reorder,
  "Save as template".
- Block data in SQL (`report_block_data` → `private.rb_<key>`), 14 Phase 1 blocks.
- Front end: block registry with error-safe frames and an "unavailable" placeholder; report and
  template builders (library, two-zone drag and drop canvas with @dnd-kit, zod-driven config
  forms, selection panel, Markdown narratives, 1 s autosave with conflict detection); viewer
  with contents; print route (A4 landscape); forum "Packs" and "Report settings" on Boards;
  `/governance/reports/*` and a Reports nav item.
- Demo seed `supabase/seed/reports_demo.sql`.

### Phase 2 — programme / portfolio packs and exception selection
- Escalation columns on risks and issues (+ panel on the project RAID tab), `forum_actions`,
  `nhs_assurance` scheme, default tolerances per forum type, escalation and dependency metrics.
- 18 more blocks (SVG charts for spend, burn-up, timelines, roadmap, heatmap).
- Programme Board and Portfolio Board / Committee system templates with the default exception
  rules; reason chips with values vs thresholds; pin / exclude / reorder; capping.
- Gate editor (Plan › Gates) for approval gates of any type.
- Partner audience: shared programme packs readable by partner organisations, with
  partner-unsafe and share-hidden blocks withheld.

### Phase 3 — governance workflow, snapshots, distribution
- Lifecycle RPCs (submit, return with comment, approve, publish, withdraw), all audited.
- Immutable `report_snapshots` / `report_metric_snapshots`; `publish_report` builds every
  snapshot in one transaction; published packs render only from snapshots.
- Changes since the previous pack (block + ▲▼ markers in grids and deep-dives), RAID movement.
- Presentation mode with a drawer to record decisions (through the decision log's rules) and
  actions, linked to the meeting and pack; the snapshot never changes.
- Edge functions `report-publish` (publish → optional server PDF → email) and
  `report-distribute` (Resend, idempotent); shared module with unit tests.
- Server-side PDF: Netlify function `netlify/functions/report-pdf.mts` behind
  `REPORT_SERVER_PDF` (off), public token print route `/report-print/<id>?token=`, bucket
  `report-pdfs`. Browser print remains the default.
- E2E spec `e2e/reports.e2e.ts` for the full cycle (seeded branch only).

### Phase 4 — enhancements
- AI executive summary (`report-ai-summary`, model from `ANTHROPIC_MODEL`), badged drafts that
  block submit / publish until edited or marked reviewed, per-organisation daily cap.
- Template versioning: version shown in the builder, "Update report to latest template".
- Scheduled pack drafts when a meeting's papers deadline passes (per-forum opt-in).
- `lessons_learned` and `linked_records` blocks; Links panel on the project page.
- PPTX deferred (RB-40).

## 2. Migrations to apply to production, in order

1. `supabase/migrations/20261103140000_rb1_report_builder_foundations.sql`
2. `supabase/migrations/20261103150000_rb2_selection_programme_packs.sql`
3. `supabase/migrations/20261103160000_rb3_governance_snapshots.sql`
4. `supabase/migrations/20261103170000_rb4_enhancements.sql`

All additive. Notes:
- Migration 2 renames `public.project_metrics` (created in migration 1) to
  `private.project_metrics_v1` and adds a new public wrapper; both are new in this branch.
- Migration 2 back-fills `forums.tolerances` with type defaults where empty; migration 1 sets
  `forums.forum_type` from `level`. Both are UPDATEs of the new columns only.
- Migration 3 creates the private storage bucket `report-pdfs` and a storage read policy.
- Migration 4 schedules `vpmo-scheduled-report-packs` (06:20 UTC) when pg_cron is present.
- Apply to a Supabase branch first; then run `supabase/tests/reports_phase1..4.sql` there after
  loading `supabase/seed/reports_demo.sql` (the tests roll back). The seed creates its own
  organisations; don't load it on production unless you want the demo organisation there.
- After applying, regenerate `types.ts` from the project (it should match the committed file).
- The local runner comments out the known stray line 7 of
  `20261012120035_health_current_b.sql` in a temporary copy (unchanged in the repo).

## 3. Environment variables and secrets

Supabase edge-function secrets:

| Secret | Used by | Notes |
|---|---|---|
| `RESEND_API_KEY` | report-publish, report-distribute | Missing: packs publish, no email; the result says so. |
| `REPORTS_FROM` | same | e.g. `ORMO PMO <reports@ormo-pmo.originoverthrow.com>`; falls back to `RESEND_FROM`. Verify the address in Resend. |
| `APP_URL` | same | Link in the email (existing secret). |
| `ANTHROPIC_API_KEY` | report-ai-summary | Missing: "AI drafting isn't set up". |
| `ANTHROPIC_MODEL` | report-ai-summary | Set to `claude-opus-5-5` (current default per Anthropic's docs, 03/11/2026). No default in code. |
| `REPORT_AI_DAILY_LIMIT` | report-ai-summary | Optional, default 50 drafts per organisation per 24 h. |
| `REPORT_SERVER_PDF` | report-publish | `true` to request a server PDF; default off. |
| `REPORT_PDF_URL` | report-publish | The Netlify function URL, e.g. `https://<site>/api/report-pdf`. |
| `REPORT_PDF_SECRET` | report-publish | Shared bearer secret with the Netlify function. |

Netlify (only if server PDF is enabled): `REPORT_SERVER_PDF=true`, `REPORT_PDF_SECRET`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and install `@sparticuz/chromium` and
`puppeteer-core` for the function (RB-35).

Deploy the edge functions `report-publish`, `report-distribute`, `report-ai-summary`
(`supabase/config.toml` keeps `verify_jwt = true` for them). Without them the app still
publishes through the RPC and says the emails weren't sent; "Draft with AI" reports that it
isn't deployed.

E2E (branch only): `E2E_REPORTS_PASSWORD` in `.env.local` (see the header of
`e2e/reports.e2e.ts`).

## 4. Decisions to confirm

From `docs/report-builder-decisions.md` (all are logged with alternatives):
- RB-2 types generated locally — regenerate from the project after applying.
- RB-5 forums extended in place; forum members stay resources (members without an account
  can't open packs and are listed in the distribution event).
- RB-6 the collection cut-off is the meeting's papers deadline; "Create pack" waits for it
  (PMO can override).
- RB-11 / RB-32 as-at: evidenced ratings for a past as-at come from nightly health snapshots;
  slip, money and RAID are current at the time of the draft / publish.
- RB-13 risk matrices drive report scoring; the organisation settings bands still drive health.
- RB-14 `rating_schemes` / `risk_matrices` are organisation-scoped (no workspace_id).
- RB-16 viewers see published packs of their workspaces and forums; drafts are for editors and
  the chair / secretary.
- RB-19..21 the §21 answers as implemented (no chair → PMO approves; PMs create Project Board
  packs for their own project; distribution to all members except contributors).
- RB-23 ad hoc reports by any contributor who can see the scope.
- RB-24 report blocks have their own renderers (scheme labels) rather than wrapping the
  overview components.
- RB-29 publish refuses packs over 2 MB of snapshot data (no Storage overflow).
- RB-34 sender address and per-recipient emails; approver reminders deferred.
- RB-35 server PDF on Netlify behind the flag.
- RB-37 AI model and daily cap. RB-39 scheduled drafts (opt-in per forum). RB-40 PPTX deferred.

## 5. Known issues

- Browser E2E could not be run here (no Docker; downloaded PostgREST / Auth binaries may not be
  executed). `e2e/reports.e2e.ts` is written but unverified; run it on a seeded branch.
- The edge functions and the Netlify function were not executed end to end (no Deno / Netlify
  here). Their logic is in tested shared modules (`report-distribution.ts`, `report-ai.ts`).
- Print was verified by rendering the seeded published pack to PDF with the bundled Chromium
  (14 A4-landscape pages with running header, footer and page numbers); not checked in
  Firefox/Safari, which ignore `@page` margin boxes (the header and page numbers are then
  missing; the content prints).
- `rating_worsened` before a pack has a previous published pack compares with the health
  snapshot four weeks earlier.
- The server print route uses the default regional settings for money and dates (no session).
- The temp table `rb_matches` used by `compute_inclusions` logs a NOTICE when used twice in one
  transaction (harmless).

## 6. Manual test — a full pack cycle

Use a Supabase branch with the four migrations and the demo seed, or real data.

1. **Forum.** Governance › Boards → choose a board (or create one) → **Report settings**: type
   Programme board, scope = a programme, rating scheme RAG, default template "Programme Board",
   check the tolerances, set member roles (a chair, a secretary, members, a contributor). Save.
2. **Pack.** Add a planned meeting whose papers deadline has passed → **Create pack** (before the
   deadline it is disabled; PMO can override). The builder opens on the template.
3. **Selection.** Selection tab: the deep-dives are the projects breaching the rules, each with
   reason chips (value vs threshold). Change a tolerance in Report settings → **Refresh
   selection** → the list changes. Pin a clean project; exclude one ("Excluded — would have
   matched …"); reorder.
4. **Content.** Add / reorder / configure blocks (drag from the library, ↑↓, inspector). Write
   the executive summary, or **Draft with AI** (badged; then edit or **Mark AI draft reviewed**).
   Report tab: overall rating and rationale. **Print / PDF** shows a clean A4 landscape layout.
5. **Review.** **Submit for review** (blocked while an AI draft is unreviewed, and without a
   rating if the scheme is an assurance scheme). As the chair: **Return** with a comment (appears
   in History), resubmit, then **Approve**.
6. **Publish.** As PMO or the secretary: **Publish** → banner "Published … · Snapshot". Change a
   project's milestone or a risk: the pack does not change. History shows "Emailed to members".
7. **Email.** Members (not contributors) receive one email each: forum, meeting date, overall
   rating label, summary, counts, **View the pack**. Publishing again is refused; re-running
   report-distribute sends nothing ("already sent"). A viewer (free seat) opens the link and
   reads the pack; **Download PDF** prints it.
8. **Present.** **Present** → full screen, ←/→ through sections and deep-dives, Esc to leave.
   In the drawer, record the decision on a "Decisions required" item (option + outcome) and add
   an action. The decision log shows the decision with the meeting and pack; the pack itself is
   unchanged.
9. **Decisions.** Governance › Decisions: the decision is Made, linked to the meeting.
10. **Second pack.** Create the next meeting's pack: **Changes since last pack** lists rating
    moves, projects entering / leaving the exceptions, slips over 7 days, budget movement and
    new top-band risks; ▲▼ markers sit next to moved ratings; **Decisions taken** lists the
    decision; **Actions log** lists the action.
11. Optional: switch the forum's scheme to NHS assurance → ratings relabel in drafts; share the
    programme with a partner organisation (SQL, `entity_shares`) → a partner member sees the
    published pack without resource / data-quality blocks.
