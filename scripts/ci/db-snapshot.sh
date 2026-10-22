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
# Copied whole despite their size: glossary pages join across the full tag set.
FULL_TABLES=${FULL_TABLES:-unified_tags}
# Admin registries copied as the dump role, not anon: queue definitions only, no
# queue rows and no user data. The admin review page needs them to render at all.
CONFIG_TABLES=${CONFIG_TABLES:-admin_review_sources,admin_review_finding_codes,triage_sources,review_field_registry}

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

  # Slugs and domains named anywhere in e2e/ are always copied, so a capped table
  # still holds the rows specs open by name (checkpoint-zuerich, /tags/transgender).
  pins=$( { grep -ohE "['\"\`][a-z0-9]+([-.][a-z0-9]+)+" -r e2e | cut -c2-
            grep -ohE "/[a-z0-9]+([-.][a-z0-9]+)*" -r e2e | cut -c2-; } | grep -E '[a-z]' | sort -u | paste -sd, -)

  # table|non-generated columns|pin column (slug/domain) or empty|capped?
  psqlq -At -F'|' -c "
    select c.relname,
           string_agg(quote_ident(a.attname), ',' order by a.attnum),
           case when bool_or(a.attname = 'slug') then 'slug' when bool_or(a.attname = 'domain') then 'domain' else '' end,
           (pg_table_size(c.oid) > $FULL_MAX_BYTES and c.relname <> all(string_to_array('$FULL_TABLES', ',')))::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'SELECT') or c.relname = any(string_to_array('$CONFIG_TABLES', ',')))
    group by c.oid, c.relname order by c.relname" > "$dir/manifest.txt"

  {
    while IFS='|' read -r t cols _ _; do
      case ",$CONFIG_TABLES," in *",$t,"*) echo "\\copy (select $cols from public.\"$t\") to '$dir/data/$t.csv' csv" ;; esac
    done < "$dir/manifest.txt"
    echo "set role anon;"
    while IFS='|' read -r t cols pin capped; do
      case ",$CONFIG_TABLES," in *",$t,"*) continue ;; esac
      q="select $cols from public.\"$t\""
      if [ "$capped" = 1 ] && [ -n "$pin" ]; then
        q="($q where $pin = any('{$pins}')) union all ($q where not coalesce($pin = any('{$pins}'), false) limit $ROW_CAP)"
      elif [ "$capped" = 1 ]; then
        q="$q limit $ROW_CAP"
      fi
      echo "\\copy ($q) to '$dir/data/$t.csv' csv"
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
