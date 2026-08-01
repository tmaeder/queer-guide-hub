#!/usr/bin/env bash
# Post-deploy smoke test for the Cloudflare Pages site.
#
# Guards the two ways the site actually went down on 2026-08-01, both of
# which shipped green because nothing checked the deployed site:
#
#   1. SPA deep routes 404 — the `/*  /index.html  200` catch-all was dropped
#      by Pages' rule parser ("infinite loop"), so every path that wasn't a
#      real file fell through to the error page. /help, /city/:slug and every
#      sitemap 404'd.
#   2. Static assets served as text/html — the replacement `/*  /  200`
#      outranked static-asset serving, so the stylesheet and module scripts
#      came back as HTML. The homepage rendered completely unstyled.
#
# Usage:  SITE_URL=https://queer.guide bash scripts/smoke-pages.sh

set -uo pipefail
SITE="${SITE_URL:-https://queer.guide}"

pass=0; fail=0

# Cloudflare needs a moment to make a fresh deployment live everywhere.
retry_status() {
	local url=$1 want=$2 code=""
	for _ in 1 2 3 4 5; do
		code=$(curl -sS -o /dev/null -w '%{http_code}' "$url" || echo 000)
		[ "$code" = "$want" ] && break
		sleep 5
	done
	echo "$code"
}

expect_status() {
	local path=$1 want=$2 code
	code=$(retry_status "$SITE$path" "$want")
	if [ "$code" = "$want" ]; then
		echo "  ✓ $path -> $code"; pass=$((pass+1))
	else
		echo "  ✗ $path -> $code (expected $want)"; fail=$((fail+1))
	fi
}

expect_content_type() {
	local path=$1 want=$2 ct
	ct=$(curl -sS -o /dev/null -w '%{content_type}' "$SITE$path")
	case "$ct" in
		*"$want"*) echo "  ✓ $path is $ct"; pass=$((pass+1)) ;;
		*)         echo "  ✗ $path is $ct (expected $want)"; fail=$((fail+1)) ;;
	esac
}

echo "== SPA routes serve the app, not the error page =="
# /help is the crisis hub — the one page where a 404 is least acceptable.
# /venues/guides is a static sub-route, so it stays a 200 even once the edge
# middleware is live and hard-404s unknown entity slugs.
for route in / /help /venues /events /map /venues/guides; do
	expect_status "$route" 200
done

echo "== static assets keep their real content types =="
expect_content_type /robots.txt text/plain
expect_content_type /manifest.json application/json

# Resolve the hashed stylesheet and entry script straight out of the shipped
# HTML. If a rewrite is shadowing static assets these come back as text/html,
# which is exactly what rendered the homepage unstyled.
home=$(curl -sS "$SITE/")
css=$(printf '%s' "$home" | grep -oE '/assets/css/[^"]+\.css' | head -1)
js=$(printf '%s' "$home" | grep -oE '/assets/js/index-[^"]+\.js' | head -1)

if [ -n "$css" ]; then
	expect_content_type "$css" text/css
else
	echo "  ✗ no stylesheet found in / — the HTML shell looks wrong"; fail=$((fail+1))
fi

if [ -n "$js" ]; then
	expect_content_type "$js" javascript
else
	echo "  ✗ no entry script found in / — the HTML shell looks wrong"; fail=$((fail+1))
fi

# Reported, not gated. Pages' built-in SPA fallback answers *any* unmatched
# path with index.html, hashed-asset URLs included, so a stale bundle asking
# for a deleted chunk gets 200 text/html here. Two layers already absorb that:
# public/sw.js turns an HTML answer for a .js/.css URL into a synthetic 404,
# and functions/_middleware.ts does the same at the edge whenever Pages
# Functions are running. Kept visible so the gap doesn't get forgotten.
echo "== missing hashed asset (informational) =="
stale="/assets/js/does-not-exist-00000000.js"
echo "  · $stale -> $(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$SITE$stale")"

echo
echo "smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
