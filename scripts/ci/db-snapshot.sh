#!/usr/bin/env bash
# Build or load the CI database snapshot.
#
#   db-snapshot.sh dump <prod-db-url> <out-dir>   (nightly, main only)
#   db-snapshot.sh load <local-db-url> <in-dir>   (Critical paths, e2e-pr.yml)
#
# The snapshot is the production SCHEMA plus a DATA SUBSET read as the `anon`
# role, so RLS decides what is copied: it holds only rows an anonymous visitor
# can already read on queer.guide, plus four static review configuration tables.
# No auth, profiles, staging, logs, private queue records or vault.
# Tables up to FULL_MAX_BYTES are copied whole; larger ones are capped at
# ROW_CAP rows. Loading runs with session_replication_role=replica so foreign
# keys and triggers (search sync, pg_net posts) do not fire.
set -euo pipefail

FULL_MAX_BYTES=${FULL_MAX_BYTES:-20000000}
ROW_CAP=${ROW_CAP:-3000}
# Preserve main's complete public glossary export. Other large tables remain capped.
FULL_TABLES=${FULL_TABLES:-unified_tags}
# Fixed static registries only; no private queue records or user data.
CONFIG_TABLES=admin_review_sources,admin_review_finding_codes,triage_sources,review_field_registry

cmd=$1 db=$2 dir=$3
# SUPABASE_DB_URL is written for node-postgres; libpq and the CLI reject no-verify.
db=${db//sslmode=no-verify/sslmode=require}
psqlq() { psql "$db" -X -v ON_ERROR_STOP=1 "$@"; }

case "$cmd" in
dump)
  mkdir -p "$dir/data"
  "$(dirname "$0")/supabase-retry.sh" db dump --db-url "$db" --role-only -f "$dir/roles.sql"
  "$(dirname "$0")/supabase-retry.sh" db dump --db-url "$db" -f "$dir/schema.sql"
  psqlq -At -c "select version from supabase_migrations.schema_migrations order by 1" > "$dir/versions.txt"

  # Bound the export while prioritizing actual browser route fixtures and
  # their parent cities. Public data is read as anon; the fixed static registries
  # are exported separately, matching main.
  FULL_MAX_BYTES="$FULL_MAX_BYTES" ROW_CAP="$ROW_CAP" FULL_TABLES="$FULL_TABLES" \
    node "$(dirname "$0")/snapshot-fixtures.mjs" manifest > "$dir/manifest-query.sql"
  psqlq -At -F'|' -f "$dir/manifest-query.sql" > "$dir/manifest.txt"
  rm "$dir/manifest-query.sql"

  {
    # These definitions are code/configuration, as in main's exporter.
    while IFS='|' read -r t cols _; do
      case ",$CONFIG_TABLES," in *",$t,"*) echo "\\copy (select $cols from public.\"$t\") to '$dir/data/$t.csv' csv" ;; esac
    done < "$dir/manifest.txt"
    echo "set role anon;"
    # Match an anonymous PostgREST request: auth.role() reads JWT claims,
    # not the SQL role. No subject or authenticated/service claim is set.
    echo "set request.jwt.claims = '{\"role\":\"anon\"}';"
    while IFS='|' read -r t cols lim; do
      case ",$CONFIG_TABLES," in *",$t,"*) continue ;; esac
      echo "\\copy (select $cols from public.\"$t\"$lim) to '$dir/data/$t.csv' csv"
    done < "$dir/manifest.txt"
  } > "$dir/copy-out.sql"
  # A table anon cannot actually read (column grants, RLS errors) is skipped, not fatal.
  psql "$db" -X -q -f "$dir/copy-out.sql" 2>&1 | grep -i error || true
  rm "$dir/copy-out.sql"
  du -sh "$dir"
  ;;

load)
  psql "$db" -X -q -f "$dir/roles.sql" 2>&1 | grep -i error | grep -iv 'already exists' || true
  # Not ON_ERROR_STOP: report every schema error, then let the specs decide.
  psql "$db" -X -q -f "$dir/schema.sql" > /tmp/schema-load.log 2>&1 || true
  echo "schema errors: $(grep -c ERROR /tmp/schema-load.log)"; grep ERROR /tmp/schema-load.log | head -20 || true
  {
    echo "set session_replication_role = replica;"
    while IFS='|' read -r t cols _; do
      if [ -s "$dir/data/$t.csv" ]; then echo "\\copy public.\"$t\" ($cols) from '$dir/data/$t.csv' csv"; fi
    done < "$dir/manifest.txt"
  } > /tmp/copy-in.sql
  psql "$db" -X -q -f /tmp/copy-in.sql 2>&1 | grep -i error || true
  # A schema-only dump creates materialized views WITH NO DATA; populate them
  # now that the rows are in. Two passes: a view reading another view refreshes
  # on the second pass. Every schema: tag_usage_summary lives in api_cache.
  for pass in 1 2; do
    psql "$db" -X -q -At -c "select format('refresh materialized view %I.%I;', schemaname, matviewname) from pg_matviews where not ispopulated" \
      | psql "$db" -X -q 2>&1 | grep -i error || true
  done
  ;;

*) echo "usage: $0 dump|load <db-url> <dir>" >&2; exit 2 ;;
esac
