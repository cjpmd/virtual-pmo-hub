#!/usr/bin/env bash
# Local throwaway Postgres 16 with a Supabase shim, for applying every migration and running the
# SQL / RLS tests without Docker or the Supabase CLI. Never points at a hosted project.
#   supabase/tests/local/run.sh init     create the cluster (PGDATA) and start it on port 54329
#   supabase/tests/local/run.sh migrate  drop + recreate db "vpmo", apply shim + all migrations
#   supabase/tests/local/run.sh seed     apply supabase/seed/reports_demo.sql
#   supabase/tests/local/run.sh test     run supabase/tests/reports_*.sql
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN=/usr/lib/postgresql/16/bin
PGDATA="${PGDATA:-/tmp/vpmo-pg}"
PORT="${PGPORT:-54329}"
export PGHOST=/tmp PGPORT="$PORT" PGUSER=postgres
cmd="${1:-all}"
init() {
  if [ ! -d "$PGDATA" ]; then
    mkdir -p "$PGDATA"; chown postgres "$PGDATA" 2>/dev/null || true
    su postgres -c "$BIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null 2>&1 || $BIN/initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null
  fi
  if ! $BIN/pg_isready -q -h /tmp -p "$PORT"; then
    su postgres -c "$BIN/pg_ctl -D $PGDATA -o '-p $PORT -k /tmp' -l $PGDATA/log -w start" >/dev/null 2>&1 \
      || $BIN/pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp" -l "$PGDATA/log" -w start >/dev/null
  fi
}
migrate() {
  psql -q -d postgres -c "drop database if exists vpmo" -c "create database vpmo" >/dev/null
  psql -q -v ON_ERROR_STOP=1 -d vpmo -f "$ROOT/supabase/tests/local/supabase-shim.sql" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    if ! psql -q -v ON_ERROR_STOP=1 -d vpmo -f "$f" >/tmp/vpmo-migrate.log 2>&1; then
      echo "FAILED: $(basename "$f")"; tail -20 /tmp/vpmo-migrate.log; exit 1
    fi
  done
  echo "migrations applied"
}
seed() { psql -q -v ON_ERROR_STOP=1 -d vpmo -f "$ROOT/supabase/seed/reports_demo.sql" >/dev/null && echo "seeded"; }
tests() {
  local fail=0
  for f in "$ROOT"/supabase/tests/reports_*.sql; do
    if out=$(psql -v ON_ERROR_STOP=1 -v cases="$(cat "$ROOT/src/features/reports/engine/selection-cases.json")" -At -d vpmo -f "$f" 2>&1); then echo "PASS $(basename "$f")"; else echo "FAIL $(basename "$f")"; echo "$out" | tail -15; fail=1; fi
  done
  return $fail
}
case "$cmd" in
  init) init ;; migrate) init; migrate ;; seed) seed ;; test) tests ;;
  all) init; migrate; seed; tests ;;
esac
