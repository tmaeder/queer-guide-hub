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

# Same assertion as expect_content_type, but it names WHICH of the two causes
# it is — they look identical and the remedies are opposite:
#
#   origin broken  — a rewrite in public/_redirects is shadowing static assets.
#                    Every URL is wrong, from every colo. Fix the config and
#                    redeploy.
#   poisoned edge  — the config is already correct, but a colo cached the SPA
#                    HTML for this URL back when a bad rewrite was live, under
#                    the 1-year immutable rule from public/_headers. The
#                    filename hash never moves, so NO redeploy evicts it. Only
#                    a cache purge does. This is what left queer.guide
#                    completely unstyled on 2026-08-01.
#
# The tell is the query string: Cloudflare keys the cache on the full URL, so
# ?cb= is a different entry and reaches the real object behind the bad one.
#
# Retries on the same schedule as expect_content_type first — a just-deployed
# chunk that has not propagated yet also answers text/html, and calling that a
# poisoned cache would be a confident wrong diagnosis rather than a flake.
expect_asset_type() {
	local path=$1 want=$2 ct="" busted
	for _ in 1 2 3 4 5; do
		ct=$(curl -sS -o /dev/null -w '%{content_type}' "$SITE$path")
		case "$ct" in *"$want"*) break ;; esac
		sleep 5
	done
	case "$ct" in
		*"$want"*) echo "  ✓ $path is $ct"; pass=$((pass+1)); return ;;
	esac

	busted=$(curl -sS -o /dev/null -w '%{content_type}' "$SITE$path?cb=$$-${SECONDS}")
	fail=$((fail+1))
	case "$busted" in
		*"$want"*)
			echo "  ✗ $path is $ct — POISONED EDGE CACHE (origin is fine: ?cb= gives $busted)"
			echo "    A colo is serving cached SPA HTML for this URL under"
			echo "    Cache-Control: immutable, max-age=31536000. Redeploying will NOT"
			echo "    evict it — the content hash does not change. Purge it:"
			echo "      curl -X POST https://api.cloudflare.com/client/v4/zones/\$CLOUDFLARE_ZONE_ID/purge_cache \\"
			echo "        -H \"Authorization: Bearer \$CLOUDFLARE_API_TOKEN\" -H 'Content-Type: application/json' \\"
			echo "        -d '{\"files\":[\"$SITE$path\"]}'"
			;;
		*)
			echo "  ✗ $path is $ct, and $busted with ?cb= — ORIGIN IS BROKEN"
			echo "    Static-asset serving is being shadowed. Check public/_redirects for"
			echo "    a 200-rewrite (see the do-not-add-a-catch-all block in that file)"
			echo "    and re-read the wrangler rule-parser output of the last deploy."
			;;
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

# Resolve the hashed stylesheet and scripts straight out of the shipped HTML.
# If a rewrite is shadowing static assets — or a colo cached the SPA shell
# under one of these URLs — they come back as text/html, which is exactly what
# rendered the homepage unstyled.
home=$(curl -sS "$SITE/")
css=$(printf '%s' "$home" | grep -oE '/assets/css/[^"]+\.css' | sort -u)
js=$(printf '%s' "$home" | grep -oE '/assets/js/[^"]+\.js' | sort -u)

if [ -n "$css" ]; then
	while IFS= read -r sheet; do
		expect_asset_type "$sheet" text/css
	done <<< "$css"
else
	echo "  ✗ no stylesheet found in / — the HTML shell looks wrong"; fail=$((fail+1))
fi

# Every chunk the shell references, not just the entry. The entry is the LEAST
# likely to be stuck: vite.config.ts derives __BUILD_ID__ from Date.now() when
# CF_PAGES_COMMIT_SHA is unset (which it is in deploy-pages.yml), so its hash
# rotates on every single deploy and it heals itself. vendor-*, router-* and
# friends keep their filenames across deploys — those are what stays poisoned.
if [ -n "$js" ]; then
	while IFS= read -r chunk; do
		expect_asset_type "$chunk" javascript
	done <<< "$js"
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

# Reported, not gated. Edge-cache poisoning is PER-COLO, and this script only
# ever sees one. On 2026-08-01 it passed from the GitHub runner's colo while
# queer.guide was rendering completely unstyled in Zurich. A green run proves
# this colo is clean and nothing more — when a user reports a broken site that
# this script calls healthy, run it again from their network before doubting
# them.
echo "== scope (informational) =="
echo "  · checked from a single colo: $(curl -sS -o /dev/null -D - "$SITE/" | grep -i '^cf-ray:' | tr -d '\r')"

echo
echo "smoke: $pass passed, $fail failed"
if [ "$degraded" -gt 0 ]; then
	echo "::warning::Pages Functions still not executing ($degraded checks) — sitemaps, /api/*, /brand/* and all crawler meta are dead. Not a regression from this deploy; needs Cloudflare-side investigation (see CLAUDE.md)."
fi
[ "$fail" -eq 0 ] || exit 1
