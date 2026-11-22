# NHS module — lane B run log

Lane B builds **NHS-5 (Five Case Model business cases)** and **NHS-7 (cross-organisation / ICS programmes)** in parallel with lane A, which builds NHS-1 to NHS-4, NHS-6 and NHS-8 on the `nhs/*` branches (log: `docs/nhs-run-log.md` on the newest `nhs/<n>` branch). Both packages depend only on NHS-0.

## Rules for lane B runs

- Every rule in `docs/nhs-run-log.md` ("Rules for unattended runs" and "Known conflicts") applies here too.
- Branches: `nhs-b/5` (from `nhs/0`) for NHS-5, then `nhs-b/7` (from `nhs-b/5`) for NHS-7. PR bases: `nhs-b/5` → `nhs/0`; `nhs-b/7` → `nhs-b/5`. Never push to `nhs/*` branches or `main`.
- Record status, decisions and run entries in **this file only**. Don't edit `docs/nhs-run-log.md` on lane B branches.
- **Shared functions:** where a package must `create or replace` a function that other packages also replace (for example `private.seed_module_defaults`, report block registries or dispatchers), keep the change as small as possible and list the function under "Functions replaced in lane B" below. Lane A's integration step uses that list to write one reconciliation migration that combines both lanes' versions.
- Migration file names use the real current UTC timestamp, as usual.
- Lock: set `Lock:` below to the run's start time (UTC) and push before starting work; clear it when done. A run that finds a lock newer than 90 minutes exits without changes.

Lock: 2026-11-22 21:00 UTC

## Status

| Package | Status | Branch | PR | Notes |
|---|---|---|---|---|
| NHS-5 | not started | | | |
| NHS-7 | not started | | | |

## Functions replaced in lane B

(none yet)

## Decisions for Chris

(none yet)

## Run entries

(newest last)
