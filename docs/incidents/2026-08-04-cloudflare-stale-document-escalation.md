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
