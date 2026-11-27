#!/usr/bin/env bash
# Applies the translation-queue migration to a throwaway Postgres 17 with a
# minimal fixture and runs the behaviour/RLS checks as anon, authenticated and
# service_role. Needs Homebrew postgresql@17 (not on PATH by default).
set -euo pipefail
cd "$(dirname "$0")"
REPO=$(git rev-parse --show-toplevel)
MIG=$(ls "$REPO"/supabase/migrations/*_translation_nas_queue.sql)
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH LC_ALL=C
D=$(mktemp -d "${TMPDIR:-/tmp}/qgpg.XXXX")
PORT=55433
trap 'pg_ctl -D "$D" stop -m fast >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
initdb -D "$D" -U postgres --auth=trust --locale=C >/dev/null
pg_ctl -D "$D" -o "-c listen_addresses=127.0.0.1 -p $PORT -c unix_socket_directories=''" -l "$D/log" -w start >/dev/null
createdb -h 127.0.0.1 -p $PORT -U postgres qg
run() { psql -h 127.0.0.1 -p $PORT -U postgres -d qg -q -v ON_ERROR_STOP=1 -f "$1"; }
run fixture.sql
run "$MIG" 2>/dev/null
out=$(run queue.test.sql 2>&1) || { echo "$out" | tail -5; exit 1; }
echo "$out" | grep -oE '(ok|FAIL): .*' || true
echo "$out" | grep -q 'FAIL\|ERROR:  [^p]' && { echo "$out" | grep -E 'ERROR' ; exit 1; }
denied=$(echo "$out" | grep -c 'permission denied for \(table translation_jobs\|function claim_translation_jobs\)')
[ "$denied" -eq 2 ] || { echo "FAIL: expected anon to be denied the queue table and claim RPC, got $denied denials"; exit 1; }
echo "ok: anon denied translation_jobs and claim_translation_jobs"
n=$(echo "$out" | grep -c 'ok: ')
echo "$n checks passed"
[ "$n" -ge 30 ]
