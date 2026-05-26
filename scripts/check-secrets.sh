#!/usr/bin/env bash
# Lightweight secret-leak guard. Scans STAGED files for high-signal token
# prefixes that have leaked into this repo before (see secret-scanning
# alerts #1–#4). Fast, dependency-free, runs in pre-commit.
#
# Adding a new pattern? Use a narrow prefix that won't false-positive on
# normal code. Generic JWT detection is intentionally NOT included because
# the codebase contains test JWTs in vitest fixtures.

set -u

STAGED=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$STAGED" ] && exit 0

# (label, regex). Regex is grep -E syntax.
PATTERNS=(
  "Google API key|AIzaSy[A-Za-z0-9_-]{33}"
  "Mapbox secret token|sk\\.eyJ[A-Za-z0-9._-]+"
  "Supabase service_role JWT|eyJhbGciOi[A-Za-z0-9_-]+\\.eyJ[^.]*\"role\":\"service_role\"[^.]*\\.[A-Za-z0-9_-]+"
  "AWS Access Key ID|AKIA[0-9A-Z]{16}"
  "Stripe live secret|sk_live_[0-9a-zA-Z]{24,}"
  "GitHub PAT|ghp_[A-Za-z0-9]{36}"
)

# Filter out files we don't want to scan even when staged.
SKIP_PATHS='(^|/)(node_modules|dist|coverage|\.claude|supabase/migrations/.*_legacy\.sql|supabase/legacy_migrations/)'

FOUND=0
for path in $STAGED; do
  echo "$path" | grep -E "$SKIP_PATHS" >/dev/null && continue
  [ -f "$path" ] || continue
  for entry in "${PATTERNS[@]}"; do
    label="${entry%%|*}"
    regex="${entry#*|}"
    if grep -E -n "$regex" "$path" >/dev/null 2>&1; then
      echo "✖ $label detected in $path:"
      grep -E -n "$regex" "$path" | head -3
      FOUND=1
    fi
  done
done

if [ "$FOUND" -ne 0 ]; then
  cat <<'EOF'

Secret-leak guard blocked this commit. Move the value to an env var
(see .env.example) and rotate the leaked key in its provider dashboard.
If you're certain this is a false positive (e.g. test fixture), bypass
with `git commit --no-verify` — but please don't.
EOF
  exit 1
fi
