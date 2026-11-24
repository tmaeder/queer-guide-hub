#!/usr/bin/env bash
# Standalone integration contracts against disposable PostgreSQL (no hosted writes).
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${PG_BINDIR:-}" ]]; then
  pg_bin="$PG_BINDIR"
elif command -v pg_config >/dev/null 2>&1; then
  pg_bin="$(pg_config --bindir)"
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/initdb ]]; then
  pg_bin=/opt/homebrew/opt/postgresql@17/bin
else
  echo 'PostgreSQL 17+ is required. Set PG_BINDIR to its bin directory.' >&2
  exit 1
fi
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/qg-travel-meet.XXXXXX")"
cleanup() {
  "$pg_bin/pg_ctl" -D "$test_dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$test_dir"
}
trap cleanup EXIT
"$pg_bin/initdb" -D "$test_dir/data" -A trust --no-locale > "$test_dir/init.log"
# Socket directory is unique; disable TCP so simultaneous runs cannot collide.
"$pg_bin/pg_ctl" -D "$test_dir/data" -l "$test_dir/server.log" -o "-k '$test_dir' -c listen_addresses=''" start >/dev/null
python3 - "$test_dir/seams.sql" <<'PY'
from pathlib import Path
import re, sys
root = Path('supabase/migrations')
chunks = []
for filename, name in [
    ('20260623133216_people_connection_pipeline.sql', 'ensure_conversation_between'),
    ('20260727083356_geo_p3_safety_chain_on_spine.sql', 'location_is_high_risk'),
    (None, 'death_penalty_risk'),
]:
    definition = None
    for path in ([root / filename] if filename else sorted(root.glob('*.sql'))):
        text = path.read_text()
        match = re.search(r'create (?:or replace )?function public\.' + name + r'\s*\(', text, re.I)
        if not match:
            continue
        start = match.start()
        tag = re.search(r'\bas\s+(\$\w*\$)', text[start:], re.I)
        assert tag, name
        body = start + tag.end()
        end = text.index(tag.group(1), body) + len(tag.group(1)) + 1
        definition = text[start:end]
    assert definition, name
    chunks.append(definition)
Path(sys.argv[1]).write_text('\n'.join(chunks))
PY
"$pg_bin/psql" -h "$test_dir" -d postgres -v ON_ERROR_STOP=1 \
  -f supabase/tests/fixtures/travel_meet_standalone.sql \
  -f "$test_dir/seams.sql" \
  -f supabase/migrations/20261124205533_travel_meet_connections.sql \
  -f supabase/tests/travel_meet_connections.sql > "$test_dir/contracts.log" 2>&1 || { cat "$test_dir/contracts.log"; exit 1; }
echo 'Travel meet PostgreSQL lifecycle and authorization contracts passed.'
