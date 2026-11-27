# Geocoding

Every geocoding call (address autocomplete, reverse geocoding, pipeline
geocoding, backfills, operator scripts) goes through one client:

- edge functions: `supabase/functions/_shared/photon-client.ts`
- scripts: `scripts/lib/photon.mjs` (same env vars, no DB breaker, no metrics)

There are two Photon upstreams, both OpenStreetMap data:

| Upstream | Where | Reached by |
|---|---|---|
| `self` | Photon on the home NAS (`BROKKOLI`), compose project `geocoder` | `https://geo-internal.queer.guide`, a Cloudflare Tunnel behind a Cloudflare Access service token |
| `komoot` | public `https://photon.komoot.io` | direct, rate-limited to ~1 req/s |

Nominatim is still used by `backfill-venue-cities` (single-entity mode only) and
the two shell scripts `scripts/backfill-venue-forward-geocode.sh` and
`scripts/data-cleanup/fix-venue-misplaced-coords.sh`. Public Nominatim answers
403 to the Supabase egress, so those paths only work from an operator machine.

## Modes

`PHOTON_MODE` (Supabase secret). Unset or unknown means `komoot`, and so does any
mode when `PHOTON_PRIMARY_URL` is unset.

| Mode | Who answers | What else happens |
|---|---|---|
| `komoot` | komoot | nothing; behaviour before self-hosting |
| `shadow` | komoot | the same request also goes to `self` in the background; an hourly agreement aggregate is stored |
| `primary` | `self` | on timeout (2.5 s), 403, 429, 5xx or network error the request is repeated against komoot |

A 400/404 from `self` is returned as-is: komoot would answer the same.

**Rollback:** set `PHOTON_MODE=komoot`. No deploy is needed, because the
client reads the env var on every request:

```bash
supabase secrets set --project-ref xqeacpakadqfxjxjcewc PHOTON_MODE=komoot
```

## Env vars

| Var | Where | Default | Meaning |
|---|---|---|---|
| `PHOTON_MODE` | Supabase | `komoot` | see above |
| `PHOTON_PRIMARY_URL` | Supabase | unset | `https://geo-internal.queer.guide` |
| `PHOTON_FALLBACK_URL` | Supabase | `https://photon.komoot.io` | |
| `PHOTON_ACCESS_CLIENT_ID` / `_SECRET` | Supabase | unset | Cloudflare Access service token `supabase-photon`; sent to the primary only |
| `PHOTON_PRIMARY_TIMEOUT_MS` | Supabase | 2500 | |
| `PHOTON_FALLBACK_TIMEOUT_MS` | Supabase | 8000 | callers can pass a shorter `signal` |
| `PHOTON_INTERVAL_MS` | Supabase / shell | 1100 | pause after a komoot answer |
| `PHOTON_SELF_INTERVAL_MS` | Supabase / shell | 50 | pause after a `self` answer |

Legacy names (`PHOTON_SEARCH_URL`, `PHOTON_REVERSE_URL`, `PHOTON_URL`,
`LOCATION_PHOTON_URL`) are still read for one release as the fallback base,
then removed.

Batch callers pace themselves by the upstream that actually answered:
`photonThrottleMs(result.upstream)` in edge functions, `photonPause()` in
scripts. A run that falls back to komoot slows down to komoot's limit by itself.

## Breaker

Two layers, both only for `self`:

1. **Per isolate:** 3 consecutive failures skip `self` for 60 s. This is what
   keeps a dead NAS from adding 2.5 s to every autocomplete keystroke.
2. **Shared DB breaker `photon.self`** in `api_circuit_breakers` (5 failures,
   60 s). Checked at most every 30 s per isolate, so healthy traffic adds no DB
   round-trip. It makes an outage visible across isolates and on the health page.

```sql
select state, failure_count, last_failure_at, last_success_at, open_until
from api_circuit_breakers where api_name = 'photon.self';
```

## Metrics

`photon_metrics_hourly` holds aggregates only, never query text or coordinates:
one row per (hour, caller, endpoint, mode, upstream) with request, failure and
fallback counts, a latency histogram, and in shadow mode the agreement counters.

```sql
select * from photon_metrics_summary(48);   -- service_role only
```

| Column | Meaning |
|---|---|
| `fallback_rate` | share of `primary` requests answered by komoot |
| `p50_ms` / `p95_ms` | upper bound of the latency bucket holding that percentile; null = over 5 s |
| `agree_top1_250m` | shadow: top results within 250 m |
| `agree_country` / `agree_city` | shadow: same countrycode / city of the top result |

Each request also logs one line `{"evt":"photon",caller,endpoint,mode,upstream,fallback,status,ms,n}`.
Buffered metrics flush every 30 s or 50 requests; a tail can be lost when an
isolate shuts down, which is accepted for metrics.

Golden set: `photon-golden` (admin or internal secret) asks both upstreams ~50
fixed queries (Swiss addresses, top cities, ambiguous names, typos, non-Latin
scripts, reverse points) and returns agreement, latency and the disagreements.

## The NAS side

`/volume2/geocoder` on the NVMe pool (`/volume2` is a linear array of two NVMe
drives, no redundancy, which is fine because the data can be re-downloaded).

| Path | What |
|---|---|
| `compose.yaml` | `photon` (Temurin 21, Photon 1.3.0 jar) + `cloudflared` |
| `.env` | `TUNNEL_TOKEN` only, mode 600, never committed |
| `bin/photon-1.3.0.jar` | sha256 `a89707c0…f571a5` from the GitHub release |
| `bin/log4j2.xml` | Photon at WARN, no request logging |
| `bin/fetch-db.sh` | download + MD5 + unpack into `data/new` |
| `bin/update-db.sh` | weekly update and swap |
| `data/photon_data` | the live database (~95 GB) |

- `photon` has no published ports and sits on the internal network
  `geocoder_net` (no egress).
- `cloudflared` is the only container on both `geocoder_net` and an egress
  network. The connection is outbound only: no port forwarding, no open router port.
- Access policy `supabase-only`: Service Auth with token `supabase-photon`
  only. Requests without it get 403.
- Logging: cloudflared runs at `warn` (no per-request lines) and Photon at WARN.

### RAM budget (16 GB NAS)

Measured 2026-11-21 before Photon: 4.5 GiB available, swap 8.1 of 9.7 GiB in
use, translator (`llama-server`) 3.9 GB RSS. Photon runs with `-Xmx3g` and
`mem_limit: 6g`. Upstream recommends 64 GB for a planet index, so query latency
depends on how much of the index stays in page cache. Watch `p95_ms` for
`upstream=self`.

### Weekly update

Crontab of `tmaeder`, Sunday 03:30: `bin/update-db.sh`.

1. Skip if the dump's `Last-Modified` equals `logs/dump-last-modified`.
2. Download, MD5-check and unpack into `data/new` (never over the live dir).
3. Stop `photon`, move `photon_data` to `photon_data.old`, move the new dir in, start.
4. Smoke test (forward, reverse, an address). On failure: swap back and fail.
5. After 1 h healthy, delete `photon_data.old`.

It swaps instead of testing a second Photon beside the first because a second
3 GB heap does not fit in RAM. During the few minutes of downtime the edge
functions fall back to komoot.

Result: `logs/update-status` (`OK …` / `FAIL …`) and `logs/update-<date>.log`.
Disk: needs ~1× DB + 63 GB tarball free while it runs.
