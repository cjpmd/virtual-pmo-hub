#!/usr/bin/env bash
# GL-17: health refresh cost with 1, 2 and 5 copies of the 500-project perf organisation, on the
# local Postgres only (supabase/tests/local/run.sh). Never point this at a hosted project.
#   scripts/perf-multi-tenant/run.sh          migrate, then seed and measure 1, 2 and 5 tenants
# Results go to $OUT (default /tmp/vpmo-gl17). A 5-tenant run takes about 25 minutes locally.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/perf-multi-tenant"
OUT="${OUT:-/tmp/vpmo-gl17}"
export PGHOST=/tmp PGPORT="${PGPORT:-54329}" PGUSER=postgres
mkdir -p "$OUT"
"$ROOT/supabase/tests/local/run.sh" migrate
psql -q -d postgres -c "alter database vpmo set jit = off"   # as hosted (docs/perf.md)
# Tenant copies of the seed: the same data under another id prefix, slug and name.
for n in 1 2 3 4 5; do
  mkdir -p "$OUT/t$n"
  for f in seed-perf-org.sql seed-perf-org-financials.sql seed-perf-org-pathway.sql; do
    sed -e "s/virtual-pmo-perf/virtual-pmo-perf-t$n/g" -e "s/perf-test-university/perf-test-university-t$n/g" \
        -e "s/Perf Test University/Perf Test University T$n/g" "$ROOT/scripts/$f" > "$OUT/t$n/$f"
  done
done
seed() { psql -v ON_ERROR_STOP=1 -q -d vpmo -f "$OUT/t$1/seed-perf-org.sql" >/dev/null; psql -q -d vpmo -c analyze; }
seed 1; psql -q -d vpmo -f "$HERE/member.sql"
psql -At -d vpmo -f "$HERE/measure.sql" | tee "$OUT/n1.txt"
seed 2; psql -At -d vpmo -f "$HERE/measure.sql" | tee "$OUT/n2.txt"
seed 3; seed 4; seed 5; psql -At -d vpmo -f "$HERE/measure.sql" | tee "$OUT/n5.txt"
# Options at 5 tenants. options.sql needs inv.sql: the live_* functions as security invoker.
for f in live_project_health live_programme_health live_portfolio_health; do
  psql -At -d vpmo -c "select pg_get_functiondef('private.$f'::regproc) || ';'"
done | sed -e 's/CREATE OR REPLACE FUNCTION private.live_/create or replace function pg_temp.inv_/' \
           -e 's/ SECURITY DEFINER//' -e 's/RETURNS SETOF \([a-z_]*\)/RETURNS SETOF public.\1/' > "$HERE/inv.sql"
(cd "$HERE" && psql -At -d vpmo -f options.sql | tee "$OUT/optC5.txt")
(cd "$HERE" && psql -At -d vpmo -f option_b.sql | tee "$OUT/optB5.txt")
rm -f "$HERE/inv.sql"
