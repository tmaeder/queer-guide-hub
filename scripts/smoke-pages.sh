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

# Every hashed asset this run checked, poisoned or not. #2512 widened the purge
# to cover every SPA ROUTE for exactly the colo-blindness reason below; the same
# argument applies to the hashed assets, which it left narrow.
ALL_ASSETS=()

# EVERY curl below must be bounded. curl has no default total-time limit, so a
# request that connects and then stalls waits ~forever — and most of the calls
# here sit inside 5-attempt retry loops, so one stall is multiplied by five and
# then again by the number of checks.
#
# Measured on the 2026-08-09 deploy of d9f5a26dd: this step ran 19m25s
# (08:52:41 -> 09:12:06) and was killed by the job's `timeout-minutes: 20`,
# while the identical script against the identical live site finishes in ~30s.
# "Deploy to Cloudflare Pages" had already SUCCEEDED, so the cancellation
# painted a healthy, fully-shipped deploy red — the most expensive kind of
# false alarm, because the only way to disbelieve it is to read step-level
# conclusions. A bounded curl turns that into a normal ✗ on one check.
#
# 15s is two orders of magnitude above the ~200ms these endpoints actually
# take, so it can only fire on a genuine stall, never on a slow-but-working
# edge. The sweep's own curl already carries -m 10 and is left alone (it runs
# in an `sh -c` subshell that cannot see this bash array).
CURL_TIMEOUT=(--connect-timeout 5 -m 15)

# Cloudflare needs a moment to make a fresh deployment live everywhere.
retry_status() {
	local url=$1 want=$2 code=""
	for _ in 1 2 3 4 5; do
		code=$(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -w '%{http_code}' "$url" || echo 000)
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
		ct=$(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -w '%{content_type}' "$SITE$path")
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
	ALL_ASSETS+=("$path|$want")
	for _ in 1 2 3 4 5; do
		busted=$(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -w '%{content_type}' "$SITE$path?cb=$$-${SECONDS}-${RANDOM}")
		case "$busted" in *"$want"*) break ;; esac
		sleep 5
	done

	ct=$(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -w '%{content_type}' \
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
	curl -sS "${CURL_TIMEOUT[@]}" "$1" | grep -oE '/assets/js/index-[^"]+\.js' | sort -u | head -1
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
home=$(curl -sS "${CURL_TIMEOUT[@]}" "$SITE/")
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

# LAZY ROUTE CHUNKS (2026-08-06). Everything above is discovered by grepping
# the shell's HTML, which can only ever see what the shell preloads. Route
# chunks reached through import() — discovery-*, Venues-*, every page — appear
# in no HTML at all, so they were checked by nothing and, worse, were absent
# from the purge list built out of ALL_ASSETS. In the incident that day
# discovery-* (which carries PageHero) stayed poisoned through a targeted
# purge, an escalation to purge_everything AND a full redeploy, because its
# content had not changed so it was re-emitted under the same hash. Every
# intent page rendered chrome-only with no <h1> and the smoke run said 60/60.
#
# dist/ is present in the deploy job (the build ran in the same job), so the
# authoritative list of what this deploy emitted is right there. One CORS
# request each, parallel, and only the suspects pay for the full
# expect_asset_type treatment — a serial pass over ~800 files with its
# cache-bust and 5-attempt retry would add many minutes to every deploy.
sweep_built_assets() {
	local dist="${DIST_DIR:-dist}"
	if [ ! -d "$dist/assets" ]; then
		echo "  · no local $dist/assets — skipping the built-asset sweep (shell assets still checked)"
		return 0
	fi

	# This sweep asks "does prod serve every file MY dist produced?" — which is
	# only a meaningful question when my dist IS what prod was built from. In
	# CI it always is (the build and the deploy are the same job). Run locally
	# against a checkout whose dist/ is a few days old and every chunk whose
	# hash has since moved reports "ORIGIN IS BROKEN", because prod correctly
	# does not serve a build it never received. Measured 2026-08-06: a dist
	# from two days earlier produced 12+ such lines (AdminShell, AdminMaps,
	# AdminPipelines, …) against a completely healthy prod.
	#
	# The entry chunk is the reliable tell: vite.config.ts derives __BUILD_ID__
	# from Date.now() when CF_PAGES_COMMIT_SHA is unset, so its hash rotates on
	# every single build. If ours is not the one the live shell references, the
	# two builds are different and the sweep can only produce noise.
	local dist_entry live_entry
	dist_entry=$(cd "$dist" && find assets -name 'index-*.js' -type f 2>/dev/null | sed 's|.*/||' | sort | head -1)
	live_entry=$(printf '%s' "$home" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | sort -u | head -1)
	if [ -n "$dist_entry" ] && [ -n "$live_entry" ] && [ "$dist_entry" != "$live_entry" ]; then
		echo "  · local $dist is not the deployed build ($dist_entry vs live $live_entry)"
		echo "    — skipping the built-asset sweep; rebuild to make it meaningful."
		return 0
	fi

	local list count suspects
	list=$(cd "$dist" && find assets -type f \( -name '*.js' -o -name '*.css' \) | sed 's|^|/|' | sort)
	count=$(printf '%s\n' "$list" | grep -c . || true)
	[ "$count" -eq 0 ] && return 0
	echo "  · sweeping $count built assets for the CORS cache variant"

	# Only the CORS variant is ever poisoned, so that is the only probe needed
	# to find suspects. Failures here are re-checked properly below.
	#
	# `-n 1 sh -c '...' _` passes each path as "$1" rather than substituting it
	# with `-I{}`. That is not a style choice: BSD/macOS xargs caps an -I
	# replacement at 255 bytes, and the sh script below is longer, so -I aborted
	# with "command line cannot be assembled, too long" on every local run.
	# xargs then produced NO output — which is byte-for-byte what "every asset
	# is healthy" looks like — and the branch below reported
	# "✓ all N built assets" having checked exactly zero of them. GNU xargs on
	# the CI runner has no such limit, so this false green was invisible in CI
	# and hit only the machine a human runs the script on, on precisely the
	# sweep that exists to catch poisoned lazy-route chunks.
	local xrc=0
	suspects=$(printf '%s\n' "$list" | SITE="$SITE" xargs -P 12 -n 1 sh -c '
		ct=$(curl -sS -m 10 -o /dev/null -w "%{content_type}" \
			-H "Origin: $SITE" -H "Sec-Fetch-Mode: cors" -H "Sec-Fetch-Dest: script" \
			"$SITE$1" 2>/dev/null)
		case "$ct" in
			*javascript*|*ecmascript*|*css*) ;;
			*) printf "%s\n" "$1" ;;
		esac' _) || xrc=$?

	# An empty result is only good news if xargs actually ran. Never let a
	# harness failure read as a pass.
	if [ "$xrc" -ne 0 ]; then
		echo "  ✗ built-asset CORS sweep did not run (xargs exited $xrc) — NOT a pass"
		echo "    $count assets went unchecked; treat this as unknown, not clean."
		fail=$((fail+1))
		return 0
	fi

	if [ -z "$suspects" ]; then
		echo "  ✓ all $count built assets serve the right type to a CORS request"
		pass=$((pass+1))
		return 0
	fi

	while IFS= read -r asset; do
		[ -z "$asset" ] && continue
		case "$asset" in
			*.css) expect_asset_type "$asset" text/css ;;
			*)     expect_asset_type "$asset" javascript ;;
		esac
	done <<< "$suspects"
}

sweep_built_assets

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
	if [ "${SKIP_ASSET_PURGE:-}" = "1" ]; then
		echo; echo "== cache purge skipped (SKIP_ASSET_PURGE=1) =="
		return 0
	fi
	[ ${#ALL_ASSETS[@]} -eq 0 ] && [ ${#STALE_ROUTES[@]} -eq 0 ] && return 0

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
	# Same colo-blindness argument #2512 applied to routes, applied to assets:
	# this runner sees one PoP, purge-by-URL is global. On 2026-08-08 the 6
	# entries MSP could see were purged and reported "recovered 6/6" while 29
	# chunks kept serving text/html from ZRH.
	# TWO entries per asset: the plain URL and the CORS variant.
	#
	# A purge by bare URL does NOT evict the copy Cloudflare stored for the same
	# URL under `Vary: Origin`. Modules are fetched with `crossorigin`, so the
	# copy a BROWSER receives is that variant — and it can stay poisoned through
	# a purge the API reports as entirely successful. Measured 2026-08-12: after
	# a clean "purged 58 URL(s)" run, bare curl returned application/javascript
	# while `curl -H 'Origin: https://queer.guide'` still returned text/html for
	# rolldown-runtime, router, useAuth and ten more. Every route on prod was
	# blank, because the module runtime itself was being served as HTML.
	#
	# Same asymmetry the detection rule at the top of this file already knows
	# about: bare curl proves nothing about what a browser gets. It applies to
	# purging exactly as it applies to probing.
	for entry in ${ALL_ASSETS[@]+"${ALL_ASSETS[@]}"}; do
		path=${entry%%|*}
		files+=("\"$SITE$path\"")
		files+=("{\"url\":\"$SITE$path\",\"headers\":{\"Origin\":\"$SITE\"}}")
	done
	# Stale HTML documents purge by the same mechanism, just a different cache
	# class (DYNAMIC rather than the hashed assets' immutable entries).
	#
	# Every SPA route goes in, not only the ones THIS runner saw as stale.
	# Detection is per-colo — the sweep reads one PoP (see the cf-ray line
	# below) while a document can be poisoned in another. Measured on
	# 2026-08-02: run 30748289369 found `/` and `/events` stale from its colo,
	# purged 8 URLs and reported "60 passed, 0 failed", while `/venues`,
	# `/help` and `/city/berlin` were still serving an 18h-old document out of
	# ZRH and rendering completely blank. Those three were never in the purge
	# list because the runner could not see them.
	#
	# Purging a route that is already correct costs one origin re-fetch and
	# nothing else, so the safe move is to purge the whole list whenever we are
	# purging anything at all.
	local purge_routes="$ROUTES /map /news /venues/guides"
	for route in $purge_routes; do
		files+=("\"$SITE$route\"")
	done
	# Chunked at the API's documented 30-files-per-call limit. Before the SPA
	# routes were added unconditionally the list was short enough that one call
	# always sufficed; it is not any more, and an over-long body is rejected
	# wholesale — every URL would silently stay poisoned.
	local resp ok="true" body i chunk
	for (( i = 0; i < ${#files[@]}; i += 30 )); do
		chunk=("${files[@]:i:30}")
		body=$(printf '{"files":[%s]}' "$(IFS=,; echo "${chunk[*]}")")
		resp=$(curl -sS "${CURL_TIMEOUT[@]}" -X POST \
			"https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
			-H "Authorization: Bearer $token" \
			-H 'Content-Type: application/json' \
			--data "$body" 2>&1)
		ok=$(printf '%s' "$resp" | grep -o '"success":[a-z]*' | head -1 | cut -d: -f2)
		[ "$ok" = "true" ] || break
	done

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

	echo "  purged ${#files[@]} URL(s) (every hashed asset + every listed SPA route)"
	echo "  · detail routes (/city/*, /venue/*, …) cannot be enumerated, so a"
	echo "    poisoned one is not covered here — it needs a dashboard purge."

	# The denominator counts only what a recovery can be VERIFIED for: the
	# entries THIS colo actually saw fail. Everything else was purged
	# prophylactically for colos we cannot reach, so there is nothing to
	# re-observe and including it would inflate the count into a fake
	# "recovered 54/54".
	local total=$(( ${#POISONED[@]} + ${#STALE_ROUTES[@]} ))
	if [ "$total" -eq 0 ]; then
		echo "  nothing failed at this colo, so there is nothing to re-verify"
		return 0
	fi
	echo "  re-checking the $total entry(ies) that failed here"
	sleep 10

	# Re-read the SAME cache variant the detection used. This curl carried no
	# Origin header until 2026-08-08, so it verified the NON-CORS entry — the one
	# that was never poisoned in the first place. A recovery check that cannot
	# observe the failure it is confirming is worse than none: it turns a red
	# signal green. That is how the 2026-08-08 deploy printed "recovered 6/6"
	# while every browser still got text/html.
	local recovered=0 want ct
	local survivors=()
	for entry in ${POISONED[@]+"${POISONED[@]}"}; do
		path=${entry%%|*}; want=${entry##*|}
		ct=$(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -w '%{content_type}' \
			-H "Origin: $SITE" -H 'Sec-Fetch-Mode: cors' -H 'Sec-Fetch-Dest: script' \
			"$SITE$path")
		case "$ct" in
			*"$want"*)
				echo "  ✓ $path recovered ($ct)"
				recovered=$((recovered+1)); pass=$((pass+1)); fail=$((fail-1))
				;;
			*)
				echo "  ✗ $path still $ct after purge — not evictable by URL"
				survivors+=("$path")
				;;
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
			survivors+=("$route")
		fi
	done
	echo "  recovered $recovered/$total"

	# ── Escalation: purge_everything ─────────────────────────────────────
	#
	# Some HTML entries are NOT evictable by URL. Measured on 2026-08-02 after
	# the deploy of efae95b: `/` and `/news` cleared from a purge call while
	# `/venues`, `/events` and `/help` — listed in the SAME request, which
	# returned success — stayed pinned at `age: 84712` (23.5h) with
	# `cf-cache-status: DYNAMIC`. DYNAMIC means the object is not in the zone
	# cache at all, so a zone purge-by-URL has nothing to evict; the copy lives
	# upstream. `?cb=` returned the correct fresh document throughout, so origin
	# was healthy the whole time and no redeploy could have helped.
	#
	# Those documents reference chunk hashes the current deploy no longer
	# serves, so every module request falls through to the SPA shell and the
	# route renders BLANK. That is a site outage for every route in this state.
	#
	# purge_everything is the only remaining lever. It is a big hammer — it
	# evicts healthy objects too and costs a cold cache — so it fires ONLY when
	# a targeted purge has already been tried and demonstrably failed on a
	# route we have PROVEN stale (cached hash != origin hash, with origin
	# verified via a cache-busted read). It cannot fire on a clean deploy.
	if [ ${#survivors[@]} -gt 0 ]; then
		echo
		echo "  ! ${#survivors[@]} entr(y/ies) survived a targeted purge:${survivors[*]}"
		echo "    These are not in the zone cache (cf-cache-status: DYNAMIC), so purge"
		echo "    by URL cannot evict them. Escalating to purge_everything."
		local eresp eok
		eresp=$(curl -sS "${CURL_TIMEOUT[@]}" -X POST \
			"https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
			-H "Authorization: Bearer $token" \
			-H 'Content-Type: application/json' \
			--data '{"purge_everything":true}' 2>&1)
		eok=$(printf '%s' "$eresp" | grep -o '"success":[a-z]*' | head -1 | cut -d: -f2)
		if [ "$eok" != "true" ]; then
			echo "    ✗ purge_everything failed: $(printf '%s' "$eresp" | head -c 200)"
			return 0
		fi
		echo "    purge_everything accepted; re-checking after propagation"
		sleep 20
		origin_now=$(origin_entry)
		# Survivors are a mixed list: hashed assets are judged by content type
		# (an asset serving text/html is the failure), SPA routes by whether the
		# document references the current entry chunk. Judging an asset by entry
		# hash would compare against markup it does not contain and report every
		# recovery as a failure.
		local item ct2
		for item in "${survivors[@]}"; do
			case "$item" in
				/assets/*)
					ct2=$(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -w '%{content_type}' \
						-H "Origin: $SITE" -H 'Sec-Fetch-Mode: cors' -H 'Sec-Fetch-Dest: script' \
						"$SITE$item")
					case "$ct2" in
						*html*)
							echo "    ✗ $item STILL text/html after purge_everything"
							echo "      DO NOT escalate to Cloudflare on this signal alone. In the"
							echo "      2026-08-04 incident this exact state was OUR bug: the SPA"
							echo "      fallback in functions/_middleware.ts fetched the shell with a"
							echo "      key that never changed across deploys, then copied that"
							echo "      subrequest's headers onto the response - publishing an age"
							echo "      that made it read as an unevictable edge cache. Check for"
							echo "      age / accept-ranges / x-robots-tag on a DYNAMIC response:"
							echo "      that combination means a header is copied from a subrequest,"
							echo "      not a CDN fault. See docs/incidents/2026-08-04-*."
							;;
						*)  echo "    ✓ $item recovered ($ct2)"; pass=$((pass+1)); fail=$((fail-1)) ;;
					esac
					;;
				*)
					plain=$(entry_hash "$SITE$item")
					if [ -n "$origin_now" ] && [ "$plain" = "$origin_now" ]; then
						echo "    ✓ $item recovered ($plain)"
						pass=$((pass+1)); fail=$((fail-1))
					else
						echo "    ✗ $item STILL stale after purge_everything (cached $plain vs origin $origin_now)"
						echo "      DO NOT escalate to Cloudflare on this signal alone. In the"
						echo "      2026-08-04 incident this exact state was OUR bug: the SPA"
						echo "      fallback in functions/_middleware.ts fetched the shell with a"
						echo "      key that never changed across deploys, then copied that"
						echo "      subrequest's headers onto the response - publishing an age"
						echo "      that made it read as an unevictable edge cache. Check for"
						echo "      age / accept-ranges / x-robots-tag on a DYNAMIC response:"
						echo "      that combination means a header is copied from a subrequest,"
						echo "      not a CDN fault. See docs/incidents/2026-08-04-*."
					fi
					;;
			esac
		done
	fi
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
	ct=$(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -w '%{content_type}' "$SITE$path")
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
if curl -sS "${CURL_TIMEOUT[@]}" "$SITE/" | grep -q 'rel="canonical"'; then
	echo "  ok   / has middleware-injected <link rel=canonical>"
else
	echo "  DEAD / has no canonical — functions/_middleware.ts is not running"
	degraded=$((degraded+1))
fi

# With the middleware live this would be a real 404. While it is dead the SPA
# fallback answers 200 text/html and public/sw.js is the only thing converting
# it, so a stale bundle without a service worker can still fail MIME checks.
stale="/assets/js/does-not-exist-00000000.js"
echo "  ·    missing chunk $stale -> $(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -w '%{http_code} %{content_type}' "$SITE$stale")"

# Reported, not gated. Edge-cache poisoning is PER-COLO, and this script only
# ever sees one. On 2026-08-01 it passed from the GitHub runner's colo while
# queer.guide was rendering completely unstyled in Zurich. A green run proves
# this colo is clean and nothing more — when a user reports a broken site that
# this script calls healthy, run it again from their network before doubting
# them.
echo "== scope (informational) =="
echo "  · checked from a single colo: $(curl -sS "${CURL_TIMEOUT[@]}" -o /dev/null -D - "$SITE/" | grep -i '^cf-ray:' | tr -d '\r')"

echo
echo "smoke: $pass passed, $fail failed"
if [ "$degraded" -gt 0 ]; then
	echo "::warning::Pages Functions still not executing ($degraded checks) — sitemaps, /api/*, /brand/* and all crawler meta are dead. Not a regression from this deploy; needs Cloudflare-side investigation (see CLAUDE.md)."
fi
[ "$fail" -eq 0 ] || exit 1
