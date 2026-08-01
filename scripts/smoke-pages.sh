#!/usr/bin/env bash
# Post-deploy smoke test for the Cloudflare Pages site.
#
# Hard-gates the two ways the site actually went down on 2026-08-01, both of
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

# Content types need the same retry as statuses. A chunk hash from the deploy
# that just finished can briefly miss at the edge, and the SPA fallback answers
# those with 200 text/html — so a one-shot check reads a propagation lag as a
# broken content type and fails the deploy. (It did, on 7f817d7f.)
expect_content_type() {
	local path=$1 want=$2 ct=""
	for _ in 1 2 3 4 5; do
		ct=$(curl -sS -o /dev/null -w '%{content_type}' "$SITE$path")
		case "$ct" in *"$want"*) break ;; esac
		sleep 5
	done
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

# Pages Functions do not execute in production. The repo is not the cause —
# the bundle compiles and uploads, _routes.json is uploaded and validated, and
# the identical code serves every Function under `wrangler pages dev`. It needs
# Cloudflare-side investigation (see CLAUDE.md).
#
# Reported, NOT gated: this is a known, tracked, pre-existing fault. Failing
# every deploy on it would mask an actual regression in the checks above, which
# are the ones that catch a deploy making things worse. The moment Functions
# come back these all flip to ok and this block can become a hard gate.
echo "== Pages Functions (known degraded — reported, not gated) =="
probe() {
	local path=$1 want=$2 ct
	ct=$(curl -sS -o /dev/null -w '%{content_type}' "$SITE$path")
	case "$ct" in
		*"$want"*) echo "  ok   $path is $ct" ;;
		*)         echo "  DEAD $path is $ct (expected $want)"; degraded=$((degraded+1)) ;;
	esac
}
degraded=0
probe /sitemap.xml xml
probe /brand/tokens.css text/css
probe /api/geo application/json

# The edge middleware rewrites the shell <head> per route. No canonical means
# the middleware did not run, whatever the Function routes returned.
if curl -sS "$SITE/" | grep -q 'rel="canonical"'; then
	echo "  ok   / has middleware-injected <link rel=canonical>"
else
	echo "  DEAD / has no canonical — functions/_middleware.ts is not running"
	degraded=$((degraded+1))
fi

# With the middleware live this would be a real 404. While it is dead the SPA
# fallback answers 200 text/html and public/sw.js is the only thing converting
# it, so a stale bundle without a service worker can still fail MIME checks.
stale="/assets/js/does-not-exist-00000000.js"
echo "  ·    missing chunk $stale -> $(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$SITE$stale")"

# Attribute the degradation instead of leaving the next person to re-run the
# whole elimination. Pages Functions are Workers and draw on the SAME account
# quota, so when it is exhausted every Worker on the account answers 429 with
# `error code: 1027` and Pages quietly serves the static layer alone. One
# standalone Worker is enough to tell "account quota" from "our bundle".
functions_verdict() {
	local code body
	code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$WORKER_CANARY" 2>/dev/null || echo 000)
	body=$(curl -sS --max-time 10 "$WORKER_CANARY" 2>/dev/null | head -c 60 || true)
	if [ "$code" = "429" ] || case "$body" in *1027*) true ;; *) false ;; esac; then
		echo "quota"
	else
		echo "unknown ($WORKER_CANARY -> $code)"
	fi
}
WORKER_CANARY=${WORKER_CANARY:-https://search.queer.guide/search}

echo
echo "smoke: $pass passed, $fail failed"
if [ "$degraded" -gt 0 ]; then
	verdict=$(functions_verdict)
	if [ "$verdict" = "quota" ]; then
		echo "::warning::Pages Functions dead ($degraded checks) because the CLOUDFLARE ACCOUNT WORKERS QUOTA IS EXHAUSTED — $WORKER_CANARY also returns 429/1027. Not a repo fault and no deploy fixes it: restore the Workers Paid plan. See CLAUDE.md 'Pages Functions do not execute in production'."
	else
		echo "::warning::Pages Functions not executing ($degraded checks) — sitemaps, /api/*, /brand/* and all crawler meta are dead. Account Workers quota looks OK ($verdict), so this is NOT the known 1027 quota stop — investigate as a new fault. See CLAUDE.md."
	fi
fi
[ "$fail" -eq 0 ] || exit 1
