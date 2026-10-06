# Performance notes

## Rule: measure as a signed-in user, through RLS

Performance is always measured the way the app runs: `set role authenticated` with `request.jwt.claims` (and `request.jwt.claim.sub`) set to a real member, never as `postgres`. RLS is part of the cost; bypassing it hid an 8 s query behind a 190 ms one. `supabase/tests/health_timings.sql` does this:

```sh
psql "$DATABASE_URL" -v uid=<profile id> -v org=demo-university -f supabase/tests/health_timings.sql
```

It selects `sum(length(h::text))` so every column is computed; `count(*)` alone lets the planner skip the expensive ones.

## Health views

### Timings (signed-in organisation admin, RLS on)

|                                                 | Project health | Programme health | Portfolio health |
| ----------------------------------------------- | -------------- | ---------------- | ---------------- |
| Hosted, demo organisation (37 projects), before | 8.4 s          | 6.8 s            | 5.9 s            |
| Hosted, demo organisation, after both fixes     | 92–131 ms      | 150–159 ms       | 238–286 ms       |
| Local, demo organisation (39 projects), after   | 68 ms          | 46 ms            | 107 ms           |
| Local, 500-project organisation, after          | 443 ms         | 857 ms           | 1.44 s           |

Before the fixes the 500-project organisation timed out on all three (over 280 s locally). The local sandbox is several times slower than hosted (the demo organisation's project health took 25 s locally against 8.4 s hosted before the fixes), so read the local figures for scale. The 500-project organisation hasn't been measured on the hosted project; see below.

### What was slow, and the fixes

1. **RLS helpers called per row** (`rls_array_helpers`). Every policy called a security-definer helper (`is_workspace_member(workspace_id)`, `can_edit_project(project_id)`, ...) for every row read, thousands of calls per health query. Policies now compare against arrays computed once per statement: `workspace_id = any ((select private.my_workspace_ids())::uuid[])`. The `::uuid[]` cast matters: without it Postgres reads `any ((select ...))` as a row sub-query. `supabase/tests/rls_matrix.sql` showed identical permissions before and after (7 kinds of user × every table × read, update, delete, insert).
2. **Work repeated inside the views** (`health_views_single_pass`).
   - The project dimensions CTE was inlined, so each dimension was computed three times per project.
   - `benefit_dimension_health()` was called per project and per programme, and each call recomputed `v_benefit_realisation` for every benefit.
   - `v_portfolio_health` ran five correlated sub-queries per portfolio.

   Each piece is now computed once. `supabase/tests/health_views_snapshot.sql` showed identical output before and after, and the benefit rule matched the old function for all 539 local projects.

What remains: the views still compute every project the caller can see, then filter. A user in two organisations pays for both; with RLS bypassed (service role) a query covers every tenant. Cost now grows roughly linearly with project count, not with its square.

### JIT

The health views' estimated cost crosses `jit_above_cost`, and JIT compilation then dominates: locally `v_portfolio_health` took 9.9 s with JIT on against 114 ms with it off. The hosted project has `jit = off`. Keep it off on any database that serves the app (a branch, a self-hosted copy, local tests: `alter database <db> set jit = off`).

### Plan (not built yet)

Store computed health per project once an organisation passes **about 150 projects**:

1. **Table.** `project_health` (project_id PK, organisation_id, workspace_id, the five dimension ratings, overall, forecast_finish_date, forecast_basis, computed_at). RLS mirrors `projects`.
2. **Refresh on writes.** Statement-level triggers on the inputs (projects, work_items, milestones, risks, issues, benefits and benefit links, dependencies, status reports, `organisations.settings.health`) collect the affected project ids and recompute just those rows from the existing view logic, filtered to those ids. Settings changes recompute the organisation.
3. **Refresh nightly.** `pg_cron` recomputes every project, because time alone changes health (dates pass and tasks become overdue). It can run alongside the `health_snapshots` capture (`private.capture_health_snapshots`).
4. **Read path.** `v_project_health` keeps its columns. Below the threshold it computes on read as now. Above it, it reads the table. Callers don't change; programme and portfolio roll-ups read the same source.
5. **Check.** Run `scripts/health-parity.ts` against both paths before switching an organisation over.

Before building, measure the 500-project organisation on the hosted project (below), signed in through RLS. After the fixes above, cost grows roughly linearly; locally, portfolio health for 500 projects is 1.4 s, so about 150 projects still looks like the right point to switch.

## Financial views

Signed-in organisation admin, RLS on (`health_timings.sql` times these too):

|                                                            | `v_project_financials` | `v_programme_financials` | `v_portfolio_financials` | `v_projects` |
| ---------------------------------------------------------- | ---------------------- | ------------------------ | ------------------------ | ------------ |
| Hosted, demo organisation                                  | 2–20 ms                | 11–17 ms                 | 11–14 ms                 | 3–4 ms       |
| Local, demo organisation                                   | 8–11 ms                | 8–11 ms                  | 8–11 ms                  |              |
| Local, 500-project organisation (24 months × 4 lines each) | 42–48 ms (125 ms cold) | 42–48 ms                 | 42–48 ms                 | 41 ms        |

With the financials in place, health on the hosted demo was 95–116 ms (project), 162–170 ms (programme) and 246–258 ms (portfolio); locally for 500 projects 441–470 ms, 664–772 ms and 1.2–1.6 s, in line with the figures above.

The first version took 700 ms for 500 projects: the cut-off (latest closed month, else last month) was written as a lateral sub-query, inlined into the monthly-value filters, so `org_today` ran once per value. `20261006133444_financials_cutoff_once` computes it once per organisation in a materialised CTE.

### Actuals import

`commit_actuals_import` for 2,000 rows across 400 projects of the 500-project organisation (local, signed in as its admin, rolled back): 2.0 s in replace mode, 1.4 s in add mode. Each row passes the `financial_values` triggers (tenant guard, closed month, audit). The local sandbox is several times slower than hosted.

## Measuring with a 500-project organisation

`scripts/seed-perf-org.sql` creates **Perf Test University** (slug `perf-test-university`):

- 25 programmes and 500 projects;
- per project: a baseline, four cost lines and 24 months of budget, actuals and forecast (`scripts/seed-perf-org-financials.sql`; one in seven over budget, one in eleven with an open-month overrun);
- per project: 3 buckets, 30 tasks, 6 milestones, 4 risks, 2 issues and 1 benefit;
- 60 people;
- dates relative to today, with a fixed mix of slipped, over-budget, overdue and closed work.

It refuses to run twice and has no members.

```sh
psql "$DATABASE_URL" -f scripts/seed-perf-org.sql      # about 10 s locally
psql "$DATABASE_URL" -c "analyze"
```

Prefer a Supabase branch over the production project. There is no clean-up script: removing the organisation means deleting from every tenant table in dependency order, so treat it as permanent wherever it runs.

To time it, run as the owner (RLS bypassed), then as a signed-in member:

```sql
\timing on
select count(*), sum(length(h::text))            -- forces every column to be computed
from v_project_health h
where h.organisation_id = (select id from organisations where slug = 'perf-test-university');
```

`count(*)` alone is misleading: the planner skips the computed columns.

To see it in the app, add your profile to the organisation:

```sql
insert into organisation_members (organisation_id, profile_id, role)
select id, '<your profile id>', 'admin' from organisations where slug = 'perf-test-university';
```

Building the script found a bug: references past 999 were truncated (`RSK-1000` became `RSK-100` and collided). This is fixed in migration `20261006090010_ref_numbers_past_999`.
