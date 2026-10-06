# Performance notes

## `v_project_health`

### What we know

- **Hosted (Supabase), demo organisation:** about **5 ms per project with RLS bypassed** (39 projects).
- **How the view works:** project health is computed on read. `v_project_health` builds a `base` CTE over projects and joins org-wide aggregates (`v_project_task_stats` groups every visible work item by project, plus milestone, risk, issue and benefit roll-ups) before any filter applies. A filter on `project_id` or `organisation_id` is not pushed into those aggregates.
- **Consequence:** asking for one project still aggregates every project the caller can see. With RLS bypassed (service role, SQL editor), that is every project in the database, across all tenants.

### Local measurements (sandbox Postgres 16, after `ANALYZE`)

Absolute times here are far slower than hosted. Use the ratios, not the numbers.

| Query (signed in, RLS on)                                                        | Visible projects | Time                |
| -------------------------------------------------------------------------------- | ---------------- | ------------------- |
| Demo organisation, one project                                                   | 39               | 0.65 s              |
| Demo organisation, all projects                                                  | 39               | 25 s                |
| Perf test organisation, one project                                              | 500              | 6.2 s               |
| Perf test organisation, first 20 rows                                            | 500              | 7.0 s               |
| Perf test organisation, all projects                                             | 500              | > 280 s (timed out) |
| Demo organisation, all projects, for a user who is also in the perf organisation | 539              | 46 s                |

Reading:

- **A single project's cost grows with the organisation's size:** about 10× slower for 13× the projects.
- **A full list grows roughly with the square of the project count.** At 500 projects the portfolio screens would not load.
- **A user in two organisations pays for both.** The aggregates cover everything RLS lets them see.
- **With RLS bypassed, one large tenant slows queries about every other tenant**, for example the demo organisation query timed out once the perf organisation existed.

### Plan (not built yet)

Store computed health per project once an organisation passes **about 150 projects**:

1. **Table.** `project_health` (project_id PK, organisation_id, workspace_id, the five dimension ratings, overall, forecast_finish_date, forecast_basis, computed_at). RLS mirrors `projects`.
2. **Refresh on writes.** Statement-level triggers on the inputs (projects, work_items, milestones, risks, issues, benefits and benefit links, dependencies, status reports, `organisations.settings.health`) collect the affected project ids and recompute just those rows from the existing view logic, filtered to those ids. Settings changes recompute the organisation.
3. **Refresh nightly.** `pg_cron` recomputes every project, because time alone changes health (dates pass and tasks become overdue). It can run alongside the `health_snapshots` capture (`private.capture_health_snapshots`).
4. **Read path.** `v_project_health` keeps its columns. Below the threshold it computes on read as now. Above it, it reads the table. Callers don't change; programme and portfolio roll-ups read the same source.
5. **Check.** Run `scripts/health-parity.ts` against both paths before switching an organisation over.

Before building, re-measure on the hosted project with the 500-project organisation (below). The local results suggest the threshold may need to be lower than 150, because the cost grows with the square of the project count. Filtering the aggregates by organisation inside the view may be a cheaper first step.

## Measuring with a 500-project organisation

`scripts/seed-perf-org.sql` creates **Perf Test University** (slug `perf-test-university`):

- 25 programmes and 500 projects;
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
