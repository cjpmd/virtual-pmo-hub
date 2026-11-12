# GL-16 — Large report packs overflow to Storage

Status: **design and SQL sketch for review, nothing built or applied** (11/11/2026, written while
Chris was away). Decision RB-29 refused packs over 2 MB of snapshot data; this replaces the refusal
with an overflow to a private Storage bucket, keeping snapshots immutable and verifiable.

## 1. Today

- `public.publish_report` (latest: `20261104150000_rb7_batched_block_data`) computes every block in
  one transaction and inserts one `report_snapshots` row per block instance (and per deep-dive
  project), plus `__meta` and `report_metric_snapshots`. Then
  `sum(pg_column_size(data)) > 2 MB` raises `54000` and the whole publish rolls back. Note that
  `pg_column_size` is the **compressed** (TOAST) size, so the real JSON is larger.
- `report_snapshots` is immutable (`private.snapshot_immutable` refuses update and delete),
  tenant-guarded, and read through RLS: `can_view_report(report_id)`, and partner viewers
  (`entity_shares`) never see `hidden_from_partners` rows or blocks the share hides.
- Readers:
  1. **Viewer** (signed in): `services/reports.ts` `listSnapshots` → `use-report-snapshots`.
  2. **Print route** `/report-print/<id>?token=` (anon) → `report_snapshot_by_token`, which returns
     the report and every snapshot row's data. This is also what the Netlify `report-pdf` renderer
     opens.
  3. **PPTX export:** client-side, from the viewer's rendered view model, so it reads whatever the
     viewer loaded. **No change needed.**
  4. **"Changes since last pack"** and RAID movement read `report_metric_snapshots`, which are
     small. **Never overflowed.**
  5. Distribution emails carry a link and optionally the PDF, not snapshot data. **No change.**
- A programme pack is about 0.1 MB, so 2 MB is about 200 deep-dives. Overflow is for portfolio
  committee packs with many deep-dives, long registers or big tables.

## 2. Options considered

| | Option | For | Against |
|---|---|---|---|
| A | **Keep large payloads in Postgres** in a side table (`report_snapshot_payloads`), raise the cap | Atomic, no new read paths, RLS reused | Doesn't do what §20 / RB-29 asked; the database and API responses grow with every big pack; `report_snapshot_by_token` returns one huge JSON |
| B | **Whole pack to Storage** when over the limit | One object per pack | Every read of a big pack downloads everything; partner filtering per block becomes impossible in one object |
| **C** | **Per-block overflow** (recommended): rows over a threshold keep their metadata and hash in the table, the payload goes to Storage | Small packs unchanged; partner rules stay per row; parallel, cacheable reads | Two-phase publish (SQL can't write Storage objects) |

## 3. Recommended design (option C)

### 3.1 Data

- **New bucket `report-snapshots`** (private, `application/json`, 50 MB per object). Path:
  `<organisation_id>/<report_id>/<snapshot_id>.json`. It starts with the organisation so the GL-11
  purge walk and the GL-11b export listing cover it.
- **`report_snapshots`** gains (additive):
  - `payload_sha256 bytea`: SHA-256 of the canonical payload text (`data::text` as Postgres prints
    jsonb, so key order is stable).
  - `payload_bytes integer`.
  - `overflowed boolean not null default false`.
  
  Rows that overflow insert `data` as `'null'::jsonb`, the JSON null, so `data` keeps its not-null
  constraint; there is no constraint change. A check: `overflowed = (payload_sha256 is not null)`.
  The existing immutable trigger is unchanged: nothing on the row is ever updated.
- **`report_snapshot_objects`** (new, insert-only):
  - columns: `snapshot_id` pk, `organisation_id`, `workspace_id`, `report_id`, `storage_path`,
    `uploaded_at`;
  - composite foreign keys to `report_snapshots` / `reports`;
  - RLS select = the same rule as `report_snapshots` (a view of the parent through an `exists`
    join on the parent row's policy);
  - no update or delete, immutable trigger, the `zz_org_read_only` trigger (system writes pass);
  - `organisation_purge.sql` / `cross_tenant.sql` cover it automatically through the catalog.
  
  Storing the pointer in its own table means the snapshot row never changes after publish.
- **`private.report_snapshot_staging`** (`snapshot_id` pk, `organisation_id`, `data jsonb`,
  `created_at`, `attempts`, `last_error`): where an overflowed payload waits until it's in Storage.
  It's private, with no grants. Its row is deleted once the object is uploaded and verified. That is
  a routine delete inside a definer function, not a migration statement.

### 3.2 Publish (two phases, still atomic for the user)

1. **`publish_report` (SQL, one transaction, as now).** After computing each block's `data`:
   - If `octet_length(data::text) <= 256 KB`: insert inline, as today.
   - Else: insert the row with `data = 'null'`, `overflowed = true`, `payload_sha256 =
     digest(data::text, 'sha256')` and `payload_bytes`, and insert `data` into
     `private.report_snapshot_staging`.
   - Limits:
     - **inline** total ≤ 2 MB compressed (today's check, now only over inline rows);
     - **overflow** total ≤ 50 MB (`54000` above that, with the same "reduce deep-dives" message);
     - per-object ≤ 50 MB.
   - The pack is **published and readable at once**: staged payloads are served from staging until
     they move (§3.3).
2. **Move to Storage (edge function `report-publish`, service role, right after the RPC).** For
   each staged row of this report:
   - `report_snapshot_staged(report_id)` (service role) returns the snapshot ids, paths and data.
   - Upload with `upsert: false`, so an object can't be overwritten.
   - Re-hash the uploaded bytes, then call `public.complete_snapshot_overflow(snapshot_id,
     storage_path, sha256)` (service role). It checks the hash equals `payload_sha256`, inserts
     `report_snapshot_objects` and deletes the staging row, in one transaction.
   - On failure: increment `attempts`, store `last_error` and leave the row in place.
3. **Retry:** the existing 15-minute `vpmo-report-notify` cron (or a new
   `vpmo-snapshot-overflow`) calls `report-publish` with `{ mode: "drain" }`, service-role only,
   to move anything still staged. After 5 failures, email `OPS_ALERT_EMAIL` (as the GL-11 purge does).

### 3.3 Reads

Every reader goes through one resolver: **inline data → Storage object → staging**.

| Reader | How it gets an overflowed block |
|---|---|
| Viewer (signed in) | `listSnapshots` also selects `overflowed, payload_sha256`, and `report_snapshot_objects.storage_path` (RLS). For each overflowed row: `supabase.storage.from('report-snapshots').download(path)` with the user's JWT; the bucket's **select policy** mirrors `report_snapshots_select` (can view the report, and partner rules on the parent row) via `private.can_view_snapshot(snapshot_id from the path)`. The client checks SHA-256 (SubtleCrypto) against `payload_sha256` and shows "This block couldn't be verified" on a mismatch. While still staged (no object row yet): `public.report_snapshot_staged_payload(snapshot_id)` (authenticated, definer, same visibility check). Downloads run in parallel and are cached by React Query (immutable, so `staleTime: Infinity`). |
| Print route (anon, token) | `report_snapshot_by_token` keeps returning inline rows, plus for overflowed rows `{ block_instance_id, entity_id, overflowed: true, sha256 }`. A new edge function **`report-snapshot-payload`** (`verify_jwt = false`) takes `{ report_id, token, snapshot_ids }`, checks the token with `report_snapshot_by_token` (so the token rules stay in one place), and returns **60-second signed URLs** (service role) for those snapshots only, or the staged data while still staged. The print page fetches them and verifies the hash as the viewer does. The Netlify renderer opens the print route, so it is covered with no change of its own. |
| PPTX export | Unchanged: built from the viewer's resolved view model. |
| GL-11b export | `report_snapshots` rows export as they are (`data: null`, hash); add bucket `report-snapshots` to the zip (these are records, not attachments) or at least list them in the manifest. The plan: include them, since they are JSON and usually small. |
| GL-11 purge | The Storage walk already removes `<org>/…` in every bucket; `purge_organisation` refuses while objects remain. Staging rows have `organisation_id`, so the catalog-driven delete covers them. |

### 3.4 Storage policies

- `report_snapshots_objects_select` on `storage.objects`: `bucket_id = 'report-snapshots' and
  private.can_view_snapshot(private.try_uuid(replace(storage.filename(name), '.json', '')))`.
  `private.can_view_snapshot(id)` reads the parent row's report and repeats the partner check of
  `report_snapshots_select`.
- No insert, update or delete policy for `authenticated`: only the service role writes, and objects
  are never replaced (`upsert: false`; the bucket has no update policy).
- The GL-4 storage write checks don't apply (no user writes). GL-10's storage cases gain this
  bucket: B can't download A's object.

### 3.5 SQL sketch (not a migration; to be finalised and tested locally when the package runs)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-snapshots', 'report-snapshots', false, 52428800, array['application/json'])
on conflict (id) do nothing;

alter table public.report_snapshots
  add column overflowed boolean not null default false,
  add column payload_sha256 bytea,
  add column payload_bytes integer,
  add constraint report_snapshots_overflow_check check (overflowed = (payload_sha256 is not null));

create table public.report_snapshot_objects (
  snapshot_id uuid primary key references public.report_snapshots (id),
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  storage_path text not null unique,
  uploaded_at timestamptz not null default now(),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
-- + RLS select mirroring report_snapshots_select (through the parent row), immutable trigger,
--   tenant guard, zz_org_read_only, grants: select to authenticated only.

create table private.report_snapshot_staging (
  snapshot_id uuid primary key references public.report_snapshots (id),
  organisation_id uuid not null references public.organisations (id),
  data jsonb not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text
);
-- no grants; read / cleared only by the definer functions below.

-- publish_report: create or replace, with the per-row threshold and the two limits (§3.2).
-- public.report_snapshot_staged(report uuid)                    service role: ids, paths, data
-- public.complete_snapshot_overflow(id uuid, path text, sha bytea)  service role: verify, insert, clear
-- public.report_snapshot_staged_payload(id uuid)                authenticated: can_view_snapshot
-- private.can_view_snapshot(id uuid)                            the report_snapshots_select rule
-- public.report_snapshot_by_token: also returns overflowed / sha256 for overflowed rows
```

Note on the immutable trigger: no change. A future `zz_org_read_only` exemption isn't needed,
because overflow writes are system writes (no signed-in user), which GL-4 already lets through.

### 3.6 Tests (when built)

- **SQL** (`supabase/tests/report_overflow.sql`, local):
  - a pack with one big block publishes, and the row has JSON null `data`, a hash and a staging row;
  - `complete_snapshot_overflow` refuses a wrong hash, then accepts the right one, clears staging,
    and can't run twice;
  - an authenticated user can't call the service-role functions;
  - a partner viewer can't read a hidden overflowed block, through the table, the staged-payload
    RPC or the storage policy;
  - the inline and overflow limits raise `54000`.
- Cross-tenant: cases for the new RPCs and the bucket.
- Unit: the client resolver (inline / object / staged, hash mismatch).
- e2e (branch only): publish a seeded large pack, open the viewer and print route, and check the
  overflowed block renders.

## 4. Decisions for Chris

1. **Option C (per-block overflow to Storage)**, or option A (keep it in Postgres, simpler)?
2. Thresholds: 256 KB per block to overflow, 2 MB inline, 50 MB per pack?
3. Include overflowed payloads in the GL-11b export zip (recommended) or only list them?
4. Retry job: reuse `vpmo-report-notify`'s 15-minute schedule, or a new cron job?

## 5. What this package delivered

This document only. No migration, code or production change.
