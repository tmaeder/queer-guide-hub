# Cloudflare escalation — apex serves a 60-hour-old HTML document that no purge can evict

**Account** `7aa3765cc5f50f2b681b782eb4a8d296` · **Zone** `queer.guide` · **Pages project** `queer-guide`
**Impact** Four high-traffic routes render a completely blank page for every visitor whose colo holds the stale object.
**Opened** 2026-08-04

---

## Symptom

`https://queer.guide/venues`, `/events`, `/map` and `/city/berlin` return HTTP 200 with a
**60-hour-old** HTML document. That document references JavaScript chunks that no longer
exist in the current deployment, so the browser refuses the module graph and `#root` stays
empty — a blank page, not a degraded one.

Measured in a browser with **no service worker and all caches cleared**:

```
#root children : 0
body text      : 0 characters
<h1>           : null
console        : 48 × failed to load /assets/js/*.js
```

## The stale object

Captured 2026-08-04, colo **ZRH**:

| route | entry chunk served | `age` | `cf-cache-status` |
|---|---|---|---|
| `/venues` | `index-BQ4YSaoC.js` | 218475 (60.7 h) | DYNAMIC |
| `/events` | `index-BQ4YSaoC.js` | 218459 | DYNAMIC |
| `/map` | `index-BQ4YSaoC.js` | 218460 | DYNAMIC |
| `/city/berlin` | `index-BQ4YSaoC.js` | 218478 | DYNAMIC |

Origin at the same moment (`queer-guide.pages.dev/venues`): **`index-D-Wi3vOA.js`**.

`age: 218475` alongside `cf-cache-status: DYNAMIC` is the core contradiction: the response
is reported as *not* served from cache, yet carries an age of more than two days.

## Origin is healthy — the apex is the only broken path

```
latest Pages deployment  /venues  -> current chunk   OK
queer-guide.pages.dev    /venues  -> current chunk   OK
queer.guide/venues?cb=1  ->  current chunk           OK      <-- same origin, different cache key
queer.guide/venues       ->  60h-old chunk           BROKEN
```

The cache-busted query string reaches the correct build over the identical path, which
isolates the fault to the cached object for the **bare URL**.

## What we have already ruled out

1. **Deployment** — the current production deployment serves the correct document. Multiple
   fresh deployments since have not evicted the apex copy.
2. **Purge by URL** — every affected URL purged explicitly; no effect.
3. **`purge_everything`** — accepted by the API, no effect. Our post-deploy smoke test
   reports verbatim:
   `✗ /venues STILL stale after purge_everything ... Not a cache this pipeline can reach.`
4. **Cache-Control** — origin sends `public, max-age=0, must-revalidate` on HTML. A
   compliant cache must revalidate before serving; this object is served without
   revalidation for 60+ hours.
5. **Pages Functions** — running correctly. The stale document contains middleware output
   (route-correct `<title>`, injected `<link rel="canonical">`) and a CSP nonce that
   **matches** the body's inline scripts, proving headers and body were cached together as
   one object at generation time.
6. **Zone configuration** — Always Online, Cache Rules, Page Rules, Workers Routes and the
   Pages custom-domain binding were all inspected in the dashboard and are not responsible.

## Not uniform across colos

CI (colo **ORD**) observed a *different* stale entry chunk than a local probe (colo **ZRH**)
at the same moment, each stale in its own way. The bad object is replicated per-PoP, and at
least one PoP retained it through `purge_everything`.

## What we are asking for

1. Identify what is retaining this object when `cf-cache-status` reports `DYNAMIC` and
   `purge_everything` does not evict it.
2. Force eviction across all PoPs for `queer.guide/venues`, `/events`, `/map`, `/city/*`.
3. Confirm whether this can recur, and what origin-side header would prevent it — noting
   `max-age=0, must-revalidate` demonstrably did not.

## Reproduction (single command)

```bash
# Stale (bare URL) vs correct (cache-busted), same origin, same instant:
curl -s https://queer.guide/venues            | grep -o 'index-[^"]*\.js'
curl -s "https://queer.guide/venues?cb=$RANDOM" | grep -o 'index-[^"]*\.js'
curl -sD - -o /dev/null https://queer.guide/venues | grep -iE '^age:|^cf-cache-status:|^cf-ray:'
```

## Mitigation in place (does not fix the fault)

`public/sw.js` v13 detects the dead-chunk condition and re-navigates the client once past
the poisoned entry via `WindowClient.navigate()`. This only helps visitors who already have
the service worker installed from a route that still works. **A first-time visitor landing
directly on an affected route still gets a blank page**, which is why this needs a
platform-side fix.

---

## Re-measured 2026-08-04 10:5x UTC — still live, and `/help` is now affected

Independent re-check from colo **ZRH**, with the same `index-BQ4YSaoC.js` object still
pinned. Two things changed since the report above was written, both worth having on the
ticket.

**The route list grew, and `/help` is on it.** `/help` is the crisis-hotlines page and is
held to a stricter standard than the rest of the site (no motion, no decorative anything,
because people reach it in distress). It is now serving a blank page.

| route | entry chunk served | `age` | `cf-cache-status` | renders |
|---|---|---|---|---|
| `/venues` | `index-BQ4YSaoC.js` | 229485 (63.7 h) | DYNAMIC | blank |
| `/events` | `index-BQ4YSaoC.js` | 229439 | DYNAMIC | blank |
| `/help` | `index-BQ4YSaoC.js` | 229469 | DYNAMIC | blank |
| `/map` | `index-BQ4YSaoC.js` | 229445 | DYNAMIC | blank |
| `/city/berlin` | `index-BQ4YSaoC.js` | 229478 | DYNAMIC | blank |

Origin at the same instant is `index-0qJmkx0m.js` — a *third* entry hash, i.e. two further
production deployments have shipped since the report was filed and neither dislodged the
object. The `age` counter has advanced in lockstep with wall-clock time, so nothing has
touched it. Measured with Playwright, service workers blocked, fresh context per route:
`#root` children `0`, body text `0` characters, `<h1>` null, 10+ `Failed to load module
script` console errors. `/`, `/cities`, `/news`, `/marketplace`, `/hotels`, `/places`,
`/personalities`, `/pride`, `/submit`, `/guides`, `/trips/discover` all serve the current
chunk and render normally.

**Do not check whether a chunk still exists with a status code.** This cost time on the
re-check and will cost the next reader the same:

```
curl -sI https://queer.guide/assets/js/index-BQ4YSaoC.js   # HTTP/2 200   <-- looks alive
```

It is `200 text/html` — Pages' built-in SPA fallback answering an unmatched path with
`index.html`, hashed-asset URLs included. The chunk is gone; the 200 is the fallback
impersonating it. That is also the precise mechanism of the blank page: the browser asks
for a module script, is handed HTML, and refuses it under strict MIME checking rather than
executing it. Compare the `content-type`, never the status:

```bash
curl -sI https://queer.guide/assets/js/index-BQ4YSaoC.js | grep -i content-type  # text/html  -> DEAD
curl -sI https://queer.guide/assets/js/index-0qJmkx0m.js | grep -i content-type  # application/javascript
```

### Two different stale generations are pinned in two PoPs at the same instant

This is the sharpest evidence available and it came out of one deploy. The
post-deploy smoke test for `a4938ede6` ran from **SJC** at 09:01 UTC and fired
the full purge ladder. A manual probe from **ZRH** two hours later saw a
*different* stale object that the same `purge_everything` had not touched:

| | SJC (CI, 09:01) | ZRH (manual, ~11:00) |
|---|---|---|
| origin entry | `index-0qJmkx0m.js` | `index-0qJmkx0m.js` |
| `/venues` cached entry | `index-vFnBxORB.js` | `index-BQ4YSaoC.js` |
| `/help` | recovered by targeted purge | still stale |

Three separate entry hashes are therefore in play simultaneously: the live one
and **two distinct dead generations**, each pinned in its own PoP. A single
`purge_everything` on the zone cleared neither of the `/venues` objects.

That also refines the earlier "purge has no effect" line, which was too
absolute: **targeted purge by URL does work on some PoPs for some routes** —
`/` and `/help` both recovered at SJC in that same run — while `/venues` and
`/events` survived both a targeted purge and `purge_everything`. So the lever
reaches part of the fleet and not the rest, which is itself a clue: whatever
holds these objects is not uniformly subscribed to zone purge.

### The deploy workflow is red on every run because of this

`Deploy to Cloudflare Pages` has failed on `main` since 07:37 UTC. The deploy
step itself succeeds — the build uploads and the origin serves the current
chunk — and it is the post-deploy smoke test that exits 1, on exactly these two
routes. That gating is deliberate: unlike the degraded Pages Functions block
just below it in `scripts/smoke-pages.sh`, a blank page is a user-facing outage
and should not be reported-not-gated.

The cost of leaving it that way is worth stating on the ticket, though: while
this fault is live, a genuinely new deploy regression would land in an already-
red workflow and be easy to miss. That is an argument for urgency on the
Cloudflare side, not for softening the gate.
