#!/usr/bin/env bash
# Runs supabase/migrations against a throwaway local PostgreSQL cluster with a stub
# `auth` schema, then the behavioural RLS tests. Touches no existing database.
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || { echo "PostgreSQL server binaries not found (set PGBIN)." >&2; exit 2; }

TMP="$(mktemp -d)"
PORT="${TEST_DB_PORT:-54329}"
run() { if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = "0" ] && chown postgres "$TMP"
cleanup() { run "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

run "$PGBIN/initdb" -D "$TMP/data" -A trust -U postgres >/dev/null
run "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
run "${PSQL[@]}" -f supabase/tests/00_auth_stub.sql
for m in supabase/migrations/*.sql; do run "${PSQL[@]}" -f "$m"; done
# Applying the migration twice must be safe (it uses IF NOT EXISTS / CREATE OR REPLACE).
for m in supabase/migrations/*.sql; do run "${PSQL[@]}" -f "$m"; done
run "${PSQL[@]}" -f supabase/tests/10_rls.test.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //'
