#!/usr/bin/env bash
set -euo pipefail
qg_pg_bin="${QG_TEST_POSTGRES_BIN:-}"
if [[ -z "$qg_pg_bin" ]]; then
  qg_initdb=$(command -v initdb || true)
  if [[ -z "$qg_initdb" ]]; then
    echo 'Set QG_TEST_POSTGRES_BIN to the directory containing PostgreSQL 17 initdb, pg_ctl and psql.' >&2
    exit 2
  fi
  qg_pg_bin=$(dirname "$qg_initdb")
fi
qg_test_dir=$(mktemp -d "${TMPDIR:-/tmp}/qg-facts-only.XXXXXX")
qg_repo_root=$(git rev-parse --show-toplevel)
cleanup() {
  "$qg_pg_bin/pg_ctl" -D "$qg_test_dir/data" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$qg_test_dir"
}
trap cleanup EXIT
"$qg_pg_bin/initdb" -D "$qg_test_dir/data" -A trust --no-locale > "$qg_test_dir/init.log"
"$qg_pg_bin/pg_ctl" -D "$qg_test_dir/data" -l "$qg_test_dir/server.log" \
  -o "-k $qg_test_dir -p 55489 -c listen_addresses=''" start >/dev/null
"$qg_pg_bin/psql" -h "$qg_test_dir" -p 55489 -d postgres -v ON_ERROR_STOP=1 \
  -f "$qg_repo_root/tests/sql/business-facts-only/bootstrap.sql" \
  -f "$qg_repo_root/supabase/migrations/20261021184341_business_facts_only_source_outcomes.sql" \
  -f "$qg_repo_root/tests/sql/business-facts-only/assertions.sql" > "$qg_test_dir/test.log" 2>&1 || {
    cat "$qg_test_dir/test.log"
    exit 1
  }
echo 'Facts-only source-contract regression passed in an isolated PostgreSQL instance.'
