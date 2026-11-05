#!/usr/bin/env bash
# Regenerate src/integrations/supabase/types.ts from the local test database (run.sh migrate
# first). Uses postgres-meta's type generator, the same one `supabase gen types` runs, installed
# into a temporary folder. Output matched the committed file apart from line wrapping (RB-2).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DIR="${PGMETA_DIR:-/tmp/vpmo-pgmeta}"
if [ ! -d "$DIR/node_modules/@supabase/postgres-meta" ]; then
  mkdir -p "$DIR" && (cd "$DIR" && npm init -y >/dev/null && npm install --no-audit --no-fund @supabase/postgres-meta@0.98.0 >/dev/null)
fi
cd "$DIR"
PG_META_DB_URL="postgresql://postgres@localhost:${PGPORT:-54329}/vpmo" \
PG_META_GENERATE_TYPES=typescript PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public \
PG_META_POSTGREST_VERSION=14.18 PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true \
  node node_modules/@supabase/postgres-meta/dist/server/server.js 2>/dev/null > "$ROOT/src/integrations/supabase/types.ts"
echo "types regenerated"
