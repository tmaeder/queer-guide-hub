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
# Pages Functions were uploaded but never invoked for months: wrangler reads
# its generated _routes.json inside a bare `catch {}`, and with nothing
# uploaded Cloudflare has no routing config for the Functions worker. Every
# Function 404'd on a green deploy. public/_routes.json now ships explicitly;
# these assertions are what proves it is actually in effect.
echo "== Pages Functions are executing =="
expect_status /sitemap.xml 200
expect_content_type /sitemap.xml xml
expect_content_type /brand/tokens.css text/css
expect_content_type /api/geo application/json

# The edge middleware rewrites the shell <head> per route. No canonical means
# the middleware did not run, whatever the Function routes returned.
if curl -sS "$SITE/" | grep -q 'rel="canonical"'; then
	echo "  ✓ / has middleware-injected <link rel=canonical>"; pass=$((pass+1))
else
	echo "  ✗ / has no canonical — functions/_middleware.ts is not running"; fail=$((fail+1))
fi

# With the middleware live, a missing hashed chunk must get a real 404 rather
# than the SPA shell — a stale bundle would otherwise try to parse HTML as JS.
echo "== missing hashed asset fails loudly =="
stale="/assets/js/does-not-exist-00000000.js"
read -r code ctype < <(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$SITE$stale")
if [ "$code" = "200" ]; then
	echo "  ✗ $stale -> 200 $ctype (stale bundles will fail MIME checks)"; fail=$((fail+1))
else
	echo "  ✓ $stale -> $code $ctype"; pass=$((pass+1))
fi

echo
echo "smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
