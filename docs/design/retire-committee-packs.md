# GL-14 — One pack system: retire Committee (Funding) packs

Status: **plan approved with decisions (12/11/2026), not built.** Written 11/11/2026; Chris's
decisions D-a to D-d and the archive decision are in §5 and override the options below.
Sources: `src/components/committee-pack.tsx` (1,128 lines), `committee-pack-list.tsx`,
`services/committee-packs.ts`, `hooks/use-committee-packs.ts`, `routes/governance.committee-packs.tsx`,
`routes/portfolio.collections.$collectionId.tsx`, `services/progress-chart.ts`, Settings › Templates,
the report builder (`src/features/reports`, `docs/report-builder-*.md`), and read-only counts from
production.

## 1. What exists today

"Committee packs" are shown in the UI as **Funding packs** since RB-9 (decision: renamed so they
can't be confused with the report builder's committee-type forum packs). One table,
`committee_packs` (migration `20261006084203_committee_packs`): organisation, workspace,
`collection_id`, title, meeting date, `content` jsonb snapshot, `issued_at` / `issued_by`. Triggers
lock an issued pack, refuse deletes, audit every change.

A pack is built for a **funding collection** (a `collections` row, i.e. a hand-picked set of
projects, optionally with a funding pot) and has these pages, in the order set in Settings ›
Templates › Funding pack template:

| Pack page | What it shows |
|---|---|
| Cover | Collection name, meeting date, cover text (Settings › Templates), organisation logo (`showLogo`), generated / issued date |
| Portfolio summary | Project count; on track / at risk / off track; total budget; approved budget vs forecast with a bar and "£X above/below"; programme coverage (projects and budget per programme) |
| Exceptions | Projects needing attention, with their latest narrative |
| Milestones | Committee milestone outlook for the collection's projects |
| Benefits realisation | Planned, realised, % realised, cash-releasing realised, at risk; by strategic objective; benefits behind; overdue measurements |
| Decisions | Decisions required (context, options, needed by, overdue); decisions made since the last meeting |
| Project highlights | One page per project: stage, budget, forecast, finish, schedule / financial / issues & risks health, reporting narrative |

Issuing (PMO / admin) stores every page as shown (content version 2 adds Benefits and Decisions);
issued packs open read-only and export to PDF through `window.print()` (A4 landscape, light theme).

Other places that depend on it:

- **Navigation:** Governance › "Funding packs" (`lib/navigation.ts`), route
  `/governance/committee-packs` (KPIs, collection list, preview, issued list).
- **Collection page** (`/portfolio/collections/<id>`): "Generate funding pack" and the issued packs list.
- **Settings › Templates › Funding pack template:** section order, cover text, show logo.
  `templates.committeePack.showLogo` is **also read by the report builder** (`blocks/catalogue/narrative.tsx`).
- **Portfolio progress chart** (`services/progress-chart.ts`): markers for committee meetings from
  `committee_packs.meeting_date`.
- Public copy: `/product` ("Funding packs built from live data …") and `/pricing`
  ("… board packs and funding packs").
- Tests: `services/committee-packs.test.ts`, `components/org-name-fallback.test.tsx`,
  `e2e/committee-packs.e2e.ts`.
- Command palette and Home: no entries. There is no command palette in use (only the unused
  `components/ui/command.tsx` primitive), and Home doesn't link to packs; the nav entry is the only
  way in.

## 2. Production data (read-only, 11/11/2026)

| | Count |
|---|---|
| `committee_packs` rows (any organisation) | **0** (0 issued, 0 draft) |
| `collections` | 3 |
| `reports` (report builder) | 3, none published |
| `report_templates` | 4 |
| `forums` | 21 |
| organisations | 4 |

No pack has ever been saved on production, so there is nothing to archive. **Decided
(12/11/2026): no read-only archive viewer.** `/governance/committee-packs` redirects to
`/governance/reports` and leaves navigation; the `committee_packs` table stays (never dropped, no
schema change), empty.

## 3. Gap: what Funding packs do that the report builder doesn't

| # | Funding pack feature | Report builder today | Gap / proposal |
|---|---|---|---|
| G1 | **Scope = a funding collection** (hand-picked projects, pot amount) | Scopes: project, programme, portfolio, custom (`scope_items`) | **Gap.** Add scope `collection` (`reports.scope_type = 'collection'`, `scope_entity_id` = collection id); the selection engine reads the collection's projects at refresh / publish time. Custom scope could hold a copy of the list, but it wouldn't follow changes to the collection. **[DB]** |
| G2 | Cover text and logo from Settings › Templates | `report_cover` block (title, forum, meeting date, as-at, rating, author); logo from `templates.committeePack.showLogo` | Small gap: add an optional cover text to `report_cover` config (or a `free_text` block after the cover in the template). Move `showLogo` to a report-builder setting before the old template settings go (see §5). |
| G3 | Summary: RAG counts, total budget, budget vs forecast, **programme coverage** | `rating_distribution`, `overall_status`, `budget_summary`, `project_status_grid` | Programme coverage (projects and budget per programme) has no block. Propose a `programme_coverage` block, or a "group by programme" option on `budget_summary`. |
| G4 | Exceptions with latest narrative | `divergence_list`, `escalations`, `top_raid`, deep-dive narratives | Covered closely enough by the existing rules (selection reasons) plus deep-dives; no new block. |
| G5 | Milestone outlook | `milestone_timeline`, `milestone_slippage` | Covered. |
| G6 | Benefits: planned / realised / % / **cash-releasing** / at risk; **by strategic objective**; behind; **overdue measurements** | `benefits_summary` (planned vs realised with health; capability and outcome ratings) | **Gap.** Extend `benefits_summary` (or add `benefits_value`) with cash-releasing realised, by-objective breakdown and overdue measurements, reusing `services/benefits-value.ts`' rules in SQL (block shaping lives in SQL). **[DB]** |
| G7 | Decisions required / made since last meeting | `decisions_required`, `decisions_taken` ("since the forum's previous meeting") | Covered. For a collection-scoped report without a forum, "since" needs a fallback (the previous published report for the same collection). |
| G8 | One highlight page per project | Deep-dives (`project_overview`, `highlight_report_summary`, `project_summary`) | Covered: pin every collection project as a deep-dive, or a template rule "include all in scope". |
| G9 | Issue = immutable snapshot | `publish_report` → `report_snapshots` (immutable), full lifecycle (submit, approve, publish) | Covered and stronger. |
| G10 | Export to PDF (print, A4 landscape) | Print route `/report-print/<id>`, A4 landscape | Covered. |
| G11 | Meeting markers on the portfolio progress chart | Forums have meetings; published reports have `as_at` / meeting | **Gap.** Read markers from published reports (or forum meetings) instead of `committee_packs`; keep reading `committee_packs` too while any exist. |
| G12 | "Generate funding pack" on the collection page | — | Replace with "New report for this collection" (opens the report builder with scope = collection, template = "Funding committee"). |
| G13 | A ready template | 4 templates (Programme Board, Portfolio Board / Committee, …) | Add a **Funding committee** template matching the pack: cover, rating distribution, budget summary, programme coverage, exceptions, milestone timeline, benefits value, decisions required / taken, deep-dive per project. Seeded per organisation like the other templates. **[DB]** |

## 4. Proposal

Phased so nothing is lost and each step can ship alone.

**Phase A — close the gaps (report builder) [DB]**
1. `collection` scope (G1): check constraints on `reports` / `report_templates` / `forums` scope
   type widened, selection engine (`private.compute_inclusions` and its TS mirror
   `engine/evaluateRules.ts` + parity cases) reads `collection_projects`. RLS: a collection-scoped
   report is visible to whoever can see the collection's workspace (same as custom).
2. Blocks: `programme_coverage` (G3) and benefits value fields (G6), shaped in SQL like the other
   blocks, with unit and SQL parity tests.
3. `report_cover` optional cover text (G2) — block config only, no schema change.
4. "Funding committee" template (G13), seeded for existing and new organisations.
5. Progress chart markers from published reports (G11).

**Phase B — switch over (front end only)**
6. Collection page: "New report for this collection" (G12); the issued list shows the collection's
   published reports. (No "Earlier funding packs" list: production has none.)
7. `/governance/committee-packs` **redirects to `/governance/reports`** (router `beforeLoad`
   redirect, keeping any `?collection=` as a filter). Remove "Funding packs" from navigation. Nothing on Home links to it.
8. ~~Archive viewer~~ **Dropped (12/11/2026):** production has 0 committee packs, so there is no
   read-only archive. Drafts can no longer be created; `committee_packs` stays as an empty table
   with its triggers.
9. Settings › Templates: remove the Funding pack template card; move `showLogo` to a report-builder
   "Branding" setting (`templates.reports.showLogo`, defaulting to the old value) and update
   `narrative.tsx`.
10. Copy: `/product` and `/pricing` lines become "board and committee packs".

**Phase C — tidy (later, optional)**
11. Delete the draft-building code (`packPages`, live section builders, the issue mutation) once
    Phase B has been live for a while; keep the issued-pack viewer for as long as any organisation
    has issued packs. The table is never dropped (immutable records); if it ever were, that would be a
    destructive statement for Chris to run by hand.

## 5. Risks and decisions for Chris

**Decisions (Chris, 12/11/2026):**

| # | Decision |
|---|---|
| D-a | A real **`collection` scope** (G1), not a custom scope. |
| D-b | **Yes:** show the pot vs requested (`collections.pot_amount` against the collection's requested total), as part of G3's programme-coverage block. |
| D-c | A **new `benefits_value` block** (G6); `benefits_summary` is unchanged. |
| D-d | `showLogo` moves **client-side as proposed**: a settings-JSON change with a fallback read of the old key; no SQL. |
| Archive | Production has 0 committee packs, so **no read-only archive**: `/governance/committee-packs` redirects to `/governance/reports` and is removed from navigation (and the command palette). |

Options as written before the decisions:

- **D-a: Collection scope or custom scope?** Recommended: a real `collection` scope (follows changes
  to the collection; the collection page can list its reports). Custom scope needs no schema change
  but copies the project list once.
- **D-b: Keep the pot amount?** Funding packs don't show `collections.pot_amount` today. Should
  the new template show "pot vs requested"? If yes, it is part of G3's block.
- **D-c: How far to go with benefits (G6)?** Extending `benefits_summary` changes existing reports'
  look; a new `benefits_value` block doesn't. Recommended: a new block.
- **D-d: `showLogo` migration.** Moving the setting is a settings-JSON change (organisations.settings),
  done in the client with a fallback read of the old key; no SQL.
- e2e: `e2e/committee-packs.e2e.ts` becomes a redirect + archive check; `reports.e2e.ts` gains a
  collection-scoped report.
- Effort: Phase A is the bulk (about one package, SQL first); Phase B is a small front-end package.

## 6. What this package delivered

This document only. No code, SQL or production change.

## 7. Phase A built (12/11/2026, not applied, not merged)

Migration `20261112130000_gl_14a_report_builder_gaps` (`docs/sql/gl-14a-report-builder-gaps.sql`;
section 0, four CHECK constraints widened, is run by hand first). Tested on the local Postgres only.

- **G1 (D-a)** `collection` scope on reports, templates and forums. `private.scope_project_ids`
  reads `collection_projects` live, so a report follows changes to its collection;
  `can_view_entity('collection')` and `create_report` (organisation and workspace from the
  collection). The builder treats a collection like a custom list for block support
  (`supportsScope` in `blocks/registry.ts`). Collection is offered in New report, the template
  builder (scope and preview) and forum report settings. The selection engine is unchanged (it
  works on project metrics, not scope), so no parity cases changed.
- **G3 (D-b)** `programme_coverage` block: projects, budget and forecast per programme; for a
  collection, pot, requested, awarded and what's left. Requested per project is, first that exists,
  the business case's `funding_requested` (latest non-superseded version with one, on the project's
  case or the case of the request it was converted from), the converted request's estimated cost,
  else the project budget; the block lists each project's amount and source and the stat says
  "From 1 business case, 1 project request and 2 project budgets". Production on 12/11/2026: no
  business case version has `funding_requested` yet, one project was converted from a request.
- **G6 (D-c)** `benefits_value` block (`benefits_summary` unchanged): planned, realised, %
  realised, cash-releasing realised of planned, at risk (low confidence or behind profile), by
  strategic objective, behind profile and overdue measurements (before the as-at date), with
  `getValueMetrics`' rules.
- **G2** `report_cover` config `cover_text` (plain text, 2,000 characters), stored in the block
  data so a published pack keeps it; the cover shows a collection's name as its scope.
- **G13** system template "Funding committee" (scope collection, forum type committee): one
  always-true rule ("In this collection") gives every project a deep-dive, ordered by programme.
- **G11** `get_portfolio_overview` committee markers also come from published committee /
  portfolio board / collection packs (meeting date, else as-at). The project chart doesn't draw
  committee markers, so `get_project_overview` is unchanged.
- D-d (`showLogo`) is client-side and left for Phase B with the Settings change.
