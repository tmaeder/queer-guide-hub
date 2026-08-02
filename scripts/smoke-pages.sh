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

# Paths proven to be poisoned edge-cache entries (plain URL wrong, ?cb= right).
# Collected rather than only printed, because this is the one failure class a
# redeploy can never fix — see purge_poisoned() at the bottom.
POISONED=()

# Deep routes serving a stale cached index.html (see the check below). Same
# remedy as a poisoned asset — a purge — so they ride the same remediation.
STALE_ROUTES=()

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
# ORDER IS LOAD-BEARING — ?cb= FIRST, and the plain URL exactly once.
#
# This script runs seconds after a deploy, and an asset that has not propagated
# to this colo yet answers with the SPA shell — which public/_headers stamps
# `immutable, max-age=31536000`. So *requesting the plain URL during the gap is
# itself what pins the wrong body for a year.* A retry loop on the plain URL is
# the worst possible shape: it hammers the very cache key it is testing, at the
# one moment that key is poisonable.
#
# It already happened: run 30721121563 reported
# /assets/js/TurnstileWidget-DqFfRY1o.js as text/html from IAD on a brand-new
# hash that could not have been poisoned by any earlier incident, while the same
# URL served application/javascript from ZRH minutes later.
#
# So: wait for the asset to exist at origin using a throwaway cache key (?cb=,
# which can only ever poison a URL nothing references), and only then read the
# real key a single time. A mismatch at that point is genuine poisoning, not a
# propagation gap.
#
# CORS VARIANT (2026-08-02): read the real key the way a BROWSER does, with an
# Origin header. Cloudflare caches the CORS and non-CORS variants of the same
# URL separately, and only the CORS one was poisoned in the incident that made
# every route render blank. A plain curl returned application/javascript and
# every smoke check passed while real browsers got text/html and #root stayed
# empty site-wide. `<link rel="modulepreload" crossorigin>` and `<script
# type="module" crossorigin>` — which is every chunk Vite emits — are fetched in
# CORS mode, so the variant this header selects is the ONLY one users ever hit.
expect_asset_type() {
	local path=$1 want=$2 ct busted=""
	for _ in 1 2 3 4 5; do
		busted=$(curl -sS -o /dev/null -w '%{content_type}' "$SITE$path?cb=$$-${SECONDS}-${RANDOM}")
		case "$busted" in *"$want"*) break ;; esac
		sleep 5
	done

	ct=$(curl -sS -o /dev/null -w '%{content_type}' \
		-H "Origin: $SITE" -H 'Sec-Fetch-Mode: cors' -H 'Sec-Fetch-Dest: script' \
		"$SITE$path")
	case "$ct" in
		*"$want"*) echo "  ✓ $path is $ct"; pass=$((pass+1)); return ;;
	esac

	fail=$((fail+1))
	case "$busted" in
		*"$want"*)
			echo "  ✗ $path is $ct — POISONED EDGE CACHE (origin is fine: ?cb= gives $busted)"
			echo "    A colo is serving cached SPA HTML for this URL under"
			echo "    Cache-Control: immutable, max-age=31536000. Redeploying will NOT"
			echo "    evict it — the content hash does not change. Only a purge does."
			POISONED+=("$path|$want")
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

# A deep route can be served a STALE cached index.html — one that references
# chunk hashes from an older deploy. Those chunk URLs no longer exist, so each
# one falls through to the SPA shell, the browser refuses `text/html` for a
# module script, and #root stays empty: a blank page, not a broken-looking one.
#
# This is invisible to every other check here. The route still answers 200
# text/html, and the homepage is usually fine because `/` is requested far more
# often and stays warm — so the site looks up while /venues, /events and
# /city/* are completely dark. Measured on 2026-08-02: /venues served a
# 16-hour-old document (age 57251) referencing index-BQ4YSaoC.js while origin
# and the homepage both served index-QdFbvcen.js. 47 chunks answered text/html
# and the page rendered nothing at all.
#
# The tell is the same one the asset check uses: ?cb= reaches origin. If the
# plain URL names a different entry chunk than the cache-busted one, the cached
# document is stale. Only a purge fixes it — the HTML is `cf-cache-status:
# DYNAMIC`, so it is not even the same cache class as the hashed assets.
#
# ONE origin reading for the whole sweep, not one per route. This is an SPA:
# every route ships the same entry chunk, so per-route ?cb= calls only add
# chances for the answer to move underneath us. It moved on the very first CI
# run of this check — a newer deploy landed mid-sweep, so /, /venues and /events
# were compared against the OLD origin and passed while /help was compared
# against the NEW one and was reported stale. All four were fine; the reading
# was not. A deploy landing mid-run must not read as a cache fault.
#
# The re-read below closes the remaining window: if anything looks stale, take a
# fresh origin reading and re-judge against it. A deploy that landed mid-sweep
# changes the origin hash and the "stale" routes resolve; a genuinely stale cache
# entry does not move and is still reported.
echo "== deep routes reference the CURRENT build =="
entry_hash() {
	curl -sS "$1" | grep -oE '/assets/js/index-[^"]+\.js' | sort -u | head -1
}
origin_entry() {
	entry_hash "$SITE/?cb=$$-${SECONDS}-${RANDOM}"
}

ROUTES="/ /venues /events /help"
origin=$(origin_entry)
if [ -z "$origin" ]; then
	echo "  ✗ / has no entry chunk even with ?cb= — the HTML shell looks wrong"
	fail=$((fail+1))
else
	suspect=""
	for route in $ROUTES; do
		[ "$(entry_hash "$SITE$route")" = "$origin" ] || suspect="$suspect $route"
	done

	# Only if something looks wrong do we pay for a second origin reading.
	if [ -n "$suspect" ]; then
		origin2=$(origin_entry)
		if [ -n "$origin2" ] && [ "$origin2" != "$origin" ]; then
			echo "  · a deploy landed mid-sweep ($origin -> $origin2); re-judging"
			origin=$origin2
			suspect=""
			for route in $ROUTES; do
				[ "$(entry_hash "$SITE$route")" = "$origin" ] || suspect="$suspect $route"
			done
		fi
	fi

	for route in $ROUTES; do
		case " $suspect " in
			*" $route "*)
				echo "  ✗ $route serves a STALE cached document"
				echo "      cached: $(entry_hash "$SITE$route")"
				echo "      origin: $origin"
				echo "    Those cached chunk URLs are gone, so every module request falls"
				echo "    through to the SPA shell and the page renders BLANK. Redeploying"
				echo "    does not help — purge the route."
				fail=$((fail+1))
				STALE_ROUTES+=("$route")
				;;
			*) echo "  ✓ $route -> $origin"; pass=$((pass+1)) ;;
		esac
	done
fi

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

# A poisoned entry is the one failure here that NO redeploy can clear: the
# filename hash does not move, so the bad object sits under `immutable,
# max-age=31536000` for a year. Rotating the hash only works for files we
# generate — /fonts, /icons and /images cannot be rotated at all. So purge.
#
# Deliberately narrow: only paths `expect_asset_type` already PROVED are
# poisoned (plain URL wrong AND ?cb= right). Never a blanket "purge
# everything" — that would also evict every healthy object and hide an
# origin-broken deploy behind a cache miss that happens to look correct.
#
# Safe to do automatically: purging cannot serve wrong content, it can only
# force a re-fetch of an object we have just proven is correct at origin.
purge_poisoned() {
	[ ${#POISONED[@]} -eq 0 ] && [ ${#STALE_ROUTES[@]} -eq 0 ] && return 0

	echo
	echo "== poisoned cache remediation =="

	# Purging is a ZONE operation. CLOUDFLARE_API_TOKEN is the account-scoped
	# Pages:Edit token used to deploy — it can publish the build but has no
	# permission on the queer.guide zone at all, so it can never purge. That is
	# why a failure here reads as code 10000 "Authentication error" (the token
	# cannot see the zone) rather than 9109 (sees it, lacks the permission):
	# 10000 looks like an expired token and sent one investigation down that
	# path, but the deploy step in the same job authenticates with the very
	# same secret and succeeds.
	#
	# So prefer CLOUDFLARE_PURGE_TOKEN, a dedicated Zone:Cache Purge token on
	# queer.guide. This split already existed in the old deploy.yml (commit
	# 09f0dcd79, Apr 2026) and was lost when that workflow was deleted in the
	# Dev/ declutter; the secret survived, unreferenced, and the purge added
	# later was wired back to the token that cannot do the job.
	local token="${CLOUDFLARE_PURGE_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
	if [ -z "${CLOUDFLARE_ZONE_ID:-}" ] || [ -z "$token" ]; then
		echo "  ! ${#POISONED[@]} poisoned asset(s) + ${#STALE_ROUTES[@]} stale route(s) and no purge credentials in env."
		echo "    Set CLOUDFLARE_ZONE_ID + CLOUDFLARE_PURGE_TOKEN (a token scoped to"
		echo "    Zone -> Cache Purge on queer.guide), or purge from the dashboard."
		echo "    Leaving them as failures."
		return 0
	fi

	# The API takes up to 30 files per call.
	local files=() path
	for entry in ${POISONED[@]+"${POISONED[@]}"}; do
		path=${entry%%|*}
		files+=("\"$SITE$path\"")
	done
	# Stale HTML documents purge by the same mechanism, just a different cache
	# class (DYNAMIC rather than the hashed assets' immutable entries).
	for route in ${STALE_ROUTES[@]+"${STALE_ROUTES[@]}"}; do
		files+=("\"$SITE$route\"")
	done
	local body
	body=$(printf '{"files":[%s]}' "$(IFS=,; echo "${files[*]}")")

	local resp ok
	resp=$(curl -sS -X POST \
		"https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
		-H "Authorization: Bearer $token" \
		-H 'Content-Type: application/json' \
		--data "$body" 2>&1)
	ok=$(printf '%s' "$resp" | grep -o '"success":[a-z]*' | head -1 | cut -d: -f2)

	if [ "$ok" != "true" ]; then
		echo "  ! purge call failed — leaving these as failures. Response:"
		printf '    %s\n' "$(printf '%s' "$resp" | head -c 400)"
		if [ -z "${CLOUDFLARE_PURGE_TOKEN:-}" ]; then
			echo "    No CLOUDFLARE_PURGE_TOKEN is set, so this fell back to the"
			echo "    account-scoped deploy token, which cannot purge a zone."
		fi
		echo "    code 10000 = the token has no access to this zone (wrong token —"
		echo "    an account/Pages token, not a Zone:Cache Purge one)."
		echo "    code 9109/403 = right zone, but the 'Cache Purge' permission is off."
		return 0
	fi

	local total=$(( ${#POISONED[@]} + ${#STALE_ROUTES[@]} ))
	echo "  purged $total URL(s); re-checking after propagation"
	sleep 10

	local recovered=0 want ct
	for entry in ${POISONED[@]+"${POISONED[@]}"}; do
		path=${entry%%|*}; want=${entry##*|}
		ct=$(curl -sS -o /dev/null -w '%{content_type}' "$SITE$path")
		case "$ct" in
			*"$want"*)
				echo "  ✓ $path recovered ($ct)"
				recovered=$((recovered+1)); pass=$((pass+1)); fail=$((fail-1))
				;;
			*)  echo "  ✗ $path still $ct after purge — investigate, this is not a stale cache" ;;
		esac
	done
	# Same single-origin discipline as the check above — one reading for the
	# whole re-verification, not one per route.
	local origin_now plain
	origin_now=$(origin_entry)
	for route in ${STALE_ROUTES[@]+"${STALE_ROUTES[@]}"}; do
		plain=$(entry_hash "$SITE$route")
		if [ -n "$origin_now" ] && [ "$plain" = "$origin_now" ]; then
			echo "  ✓ $route recovered ($plain)"
			recovered=$((recovered+1)); pass=$((pass+1)); fail=$((fail-1))
		else
			echo "  ✗ $route still stale after purge (cached $plain vs origin $origin_now)"
		fi
	done
	echo "  recovered $recovered/$total"
}
purge_poisoned

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
