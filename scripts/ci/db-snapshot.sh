#!/usr/bin/env bash
# Build or load the CI database snapshot.
#
#   db-snapshot.sh dump <prod-db-url> <out-dir>   (nightly, main only)
#   db-snapshot.sh load <local-db-url> <in-dir>   (every e2e-local run)
#
# The snapshot is the production SCHEMA plus a DATA SUBSET read as the `anon`
# role, so RLS decides what is copied: it holds only rows an anonymous visitor
# can already read on queer.guide. No auth, profiles, staging, logs or vault.
# Tables up to FULL_MAX_BYTES are copied whole; larger ones are capped at
# ROW_CAP rows. Loading runs with session_replication_role=replica so foreign
# keys and triggers (search sync, pg_net posts) do not fire.
set -euo pipefail

FULL_MAX_BYTES=${FULL_MAX_BYTES:-20000000}
ROW_CAP=${ROW_CAP:-3000}

cmd=$1 db=$2 dir=$3
psqlq() { psql "$db" -X -v ON_ERROR_STOP=1 "$@"; }

case "$cmd" in
dump)
  mkdir -p "$dir/data"
  supabase db dump --db-url "$db" --role-only -f "$dir/roles.sql"
  supabase db dump --db-url "$db" -f "$dir/schema.sql"
  psqlq -At -c "select version from supabase_migrations.schema_migrations order by 1" > "$dir/versions.txt"

  # table|non-generated columns|limit clause, for every table anon may SELECT.
  psqlq -At -F'|' -c "
    select c.relname,
           string_agg(quote_ident(a.attname), ',' order by a.attnum),
           case when pg_table_size(c.oid) > $FULL_MAX_BYTES then ' limit $ROW_CAP' else '' end
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'SELECT')
    group by c.oid, c.relname order by c.relname" > "$dir/manifest.txt"

  {
    echo "set role anon;"
    while IFS='|' read -r t cols lim; do
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
  ;;

*) echo "usage: $0 dump|load <db-url> <dir>" >&2; exit 2 ;;
esac
