// One Photon (OSM geocoder) client for every edge function.
//
// Upstreams: `self` = queer.guide's own Photon on the home NAS, reached through
// a Cloudflare Tunnel behind a Cloudflare Access service token; `komoot` = the
// public photon.komoot.io, kept as the fallback. PHOTON_MODE picks the policy:
//   komoot  – only komoot (the default, and the instant rollback: no deploy)
//   shadow  – komoot answers; the same request also goes to self in the
//             background and only an agreement AGGREGATE is recorded
//   primary – self answers; timeout / 403 / 429 / 5xx / network error falls
//             back to komoot. A per-isolate breaker plus the shared DB breaker
//             `photon.self` stop a dead NAS from costing 2.5 s per keystroke.
//
// Privacy: query text and coordinates are never logged or stored. Logs and
// metrics carry caller, endpoint, upstream, status, latency and result count.

import { checkCircuit, recordFailure, recordSuccess } from './circuit-breaker.ts'
import { getServiceClient } from './supabase-client.ts'
import { trimTrailingSlashes } from './trim-trailing-slashes.ts'

export type PhotonUpstream = 'self' | 'komoot'
export type PhotonMode = 'komoot' | 'shadow' | 'primary'
export type PhotonEndpoint = 'api' | 'reverse'

export interface PhotonFeature {
  type?: string
  geometry?: { type?: string; coordinates?: [number, number] }
  properties?: Record<string, unknown>
}
export interface PhotonCollection {
  type?: string
  features?: PhotonFeature[]
}
export interface PhotonResult {
  ok: boolean
  status: number // 0 = no HTTP response (network error / timeout)
  data: PhotonCollection | null
  upstream: PhotonUpstream
  fallback: boolean
  ms: number
  reason?: string
}
export interface PhotonSearchOpts {
  caller: string
  lang?: string
  limit?: number
  lat?: number // location bias
  lon?: number
  countryCode?: string // ISO-2 filter
  signal?: AbortSignal
}
export interface PhotonReverseOpts {
  caller: string
  lang?: string
  limit?: number
  signal?: AbortSignal
}

const USER_AGENT = 'QueerGuide/1.0 (https://queer.guide)'
const KOMOOT = 'https://photon.komoot.io'
const BREAKER = 'photon.self'
const LOCAL_FAILS_TO_OPEN = 3
const LOCAL_OPEN_MS = 60_000
const DB_RECHECK_MS = 30_000

export interface PhotonConfig {
  mode: PhotonMode
  primaryUrl: string | null
  fallbackUrl: string
  accessId: string | null
  accessSecret: string | null
  primaryTimeoutMs: number
  fallbackTimeoutMs: number
  komootIntervalMs: number
  selfIntervalMs: number
}

// Legacy env names were full endpoint URLs (…/api, …/reverse) or a base.
// Honoured as the fallback base for one release, then removed.
function legacyBase(get: (k: string) => string | undefined): string | null {
  for (const k of ['PHOTON_SEARCH_URL', 'PHOTON_URL', 'PHOTON_REVERSE_URL', 'LOCATION_PHOTON_URL']) {
    const v = get(k)?.trim()
    if (v) return trimTrailingSlashes(v).replace(/\/(api|reverse)$/, '')
  }
  return null
}

export function photonConfigFrom(get: (k: string) => string | undefined): PhotonConfig {
  const primaryUrl = get('PHOTON_PRIMARY_URL')?.trim() ? trimTrailingSlashes(get('PHOTON_PRIMARY_URL')!.trim()) : null
  const rawMode = get('PHOTON_MODE')?.trim().toLowerCase()
  const mode: PhotonMode =
    primaryUrl && (rawMode === 'shadow' || rawMode === 'primary') ? rawMode : 'komoot'
  const num = (k: string, d: number) => {
    const n = Number(get(k))
    return Number.isFinite(n) && n >= 0 && get(k) !== undefined && get(k) !== '' ? n : d
  }
  return {
    mode,
    primaryUrl,
    fallbackUrl: trimTrailingSlashes(get('PHOTON_FALLBACK_URL')?.trim() || legacyBase(get) || KOMOOT),
    accessId: get('PHOTON_ACCESS_CLIENT_ID')?.trim() || null,
    accessSecret: get('PHOTON_ACCESS_CLIENT_SECRET')?.trim() || null,
    primaryTimeoutMs: num('PHOTON_PRIMARY_TIMEOUT_MS', 2500),
    fallbackTimeoutMs: num('PHOTON_FALLBACK_TIMEOUT_MS', 8000),
    komootIntervalMs: num('PHOTON_INTERVAL_MS', 1100),
    selfIntervalMs: num('PHOTON_SELF_INTERVAL_MS', 50),
  }
}

// ---- test seams -------------------------------------------------------------
type FetchFn = (url: string, init: RequestInit) => Promise<Response>
interface Breaker {
  check(): Promise<boolean>
  fail(reason: string): Promise<boolean> // true when the shared circuit opened
  ok(): Promise<void>
}
const dbBreaker: Breaker = {
  async check() {
    try {
      return (await checkCircuit(getServiceClient(), BREAKER)).allowed
    } catch {
      return true
    }
  },
  async fail(reason) {
    try {
      return (await recordFailure(getServiceClient(), BREAKER, reason)).circuitOpened
    } catch {
      return false
    }
  },
  async ok() {
    try {
      await recordSuccess(getServiceClient(), BREAKER)
    } catch { /* bookkeeping only */ }
  },
}
let fetchImpl: FetchFn = (u, i) => fetch(u, i)
let breaker: Breaker = dbBreaker
let now = () => Date.now()
let getEnv: (k: string) => string | undefined = (k) => Deno.env.get(k)
let logImpl: (line: string) => void = (l) => console.log(l)

export function __setPhotonTestHooks(h: {
  fetch?: FetchFn
  breaker?: Breaker
  now?: () => number
  env?: (k: string) => string | undefined
  log?: (line: string) => void
  metricsSink?: MetricsSink
}): void {
  if (h.fetch) fetchImpl = h.fetch
  if (h.breaker) breaker = h.breaker
  if (h.now) now = h.now
  if (h.env) getEnv = h.env
  if (h.log) logImpl = h.log
  if (h.metricsSink) metricsSink = h.metricsSink
  resetPhotonState()
}
function resetPhotonState(): void {
  local.fails = 0
  local.blockedUntil = 0
  local.dbCheckedAt = -Infinity
  local.dbAllowed = true
  local.dirty = false
  pending.clear()
  lastFlush = now()
}

// ---- background work --------------------------------------------------------
const pendingBg = new Set<Promise<unknown>>()
function bg(p: Promise<unknown>): void {
  const safe = p.catch(() => {})
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(safe)
  pendingBg.add(safe)
  safe.finally(() => pendingBg.delete(safe))
}
/** Await outstanding shadow requests and bookkeeping (tests, batch jobs). */
export async function settlePhotonBackground(): Promise<void> {
  while (pendingBg.size) await Promise.all([...pendingBg])
}

// ---- breaker (self only) ----------------------------------------------------
const local = { fails: 0, blockedUntil: 0, dbCheckedAt: -Infinity, dbAllowed: true, dirty: false }

async function selfAllowed(): Promise<boolean> {
  const t = now()
  if (t < local.blockedUntil) return false
  if (t - local.dbCheckedAt >= DB_RECHECK_MS) {
    local.dbCheckedAt = t
    local.dbAllowed = await breaker.check()
    if (!local.dbAllowed) local.dirty = true
  }
  return local.dbAllowed
}
function selfFailed(reason: string): void {
  local.fails++
  local.dirty = true
  if (local.fails >= LOCAL_FAILS_TO_OPEN) local.blockedUntil = now() + LOCAL_OPEN_MS
  bg(breaker.fail(reason).then((opened) => {
    if (opened) {
      local.blockedUntil = Math.max(local.blockedUntil, now() + LOCAL_OPEN_MS)
      local.dbAllowed = false
    }
  }))
}
function selfSucceeded(): void {
  local.fails = 0
  local.blockedUntil = 0
  if (local.dirty) {
    local.dirty = false
    local.dbAllowed = true
    bg(breaker.ok())
  }
}

// ---- metrics (aggregates only) ---------------------------------------------
// Latency bucket upper bounds in ms; the last bucket is open-ended.
const LATENCY_BUCKETS_MS = [50, 100, 200, 300, 500, 750, 1000, 1500, 2500, 5000]
interface MetricRow {
  hour: string
  caller: string
  endpoint: PhotonEndpoint
  mode: PhotonMode
  upstream: PhotonUpstream
  requests: number
  failures: number
  fallbacks: number
  lat_buckets: number[]
  shadow_compared: number
  shadow_top1_250m: number
  shadow_same_country: number
  shadow_same_city: number
  shadow_both_empty: number
}
type MetricsSink = (rows: MetricRow[]) => Promise<void>
let metricsSink: MetricsSink = async (rows) => {
  const { error } = await getServiceClient().rpc('photon_metrics_add', { p_rows: rows })
  if (error) throw error
}
const pending = new Map<string, MetricRow>()
let lastFlush = Date.now()
const FLUSH_EVERY_MS = 30_000
const FLUSH_EVERY_N = 50

function bucketIndex(ms: number): number {
  const i = LATENCY_BUCKETS_MS.findIndex((b) => ms <= b)
  return i === -1 ? LATENCY_BUCKETS_MS.length : i
}
function row(caller: string, endpoint: PhotonEndpoint, mode: PhotonMode, upstream: PhotonUpstream): MetricRow {
  const hour = new Date(Math.floor(now() / 3_600_000) * 3_600_000).toISOString()
  const key = [hour, caller, endpoint, mode, upstream].join('|')
  let r = pending.get(key)
  if (!r) {
    r = {
      hour, caller, endpoint, mode, upstream,
      requests: 0, failures: 0, fallbacks: 0,
      lat_buckets: new Array(LATENCY_BUCKETS_MS.length + 1).fill(0),
      shadow_compared: 0, shadow_top1_250m: 0, shadow_same_country: 0, shadow_same_city: 0, shadow_both_empty: 0,
    }
    pending.set(key, r)
  }
  return r
}
let pendingEvents = 0
function noteRequest(caller: string, endpoint: PhotonEndpoint, mode: PhotonMode, r: PhotonResult): void {
  const m = row(caller, endpoint, mode, r.upstream)
  m.requests++
  if (!r.ok) m.failures++
  if (r.fallback) m.fallbacks++
  m.lat_buckets[bucketIndex(r.ms)]++
  logImpl(JSON.stringify({
    evt: 'photon', caller, endpoint, mode, upstream: r.upstream, fallback: r.fallback,
    status: r.status, ms: r.ms, n: r.data?.features?.length ?? 0, ...(r.reason ? { reason: r.reason } : {}),
  }))
  pendingEvents++
  maybeFlush()
}
function maybeFlush(): void {
  if (pendingEvents >= FLUSH_EVERY_N || now() - lastFlush >= FLUSH_EVERY_MS) bg(flushPhotonMetrics())
}
/** Write buffered aggregates. Batch jobs call this once at the end. */
export async function flushPhotonMetrics(): Promise<void> {
  if (!pending.size) return
  const rows = [...pending.values()]
  pending.clear()
  pendingEvents = 0
  lastFlush = now()
  try {
    await metricsSink(rows)
  } catch { /* metrics are best-effort */ }
}

// ---- agreement --------------------------------------------------------------
function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
function cityOf(f: PhotonFeature): string {
  const p = f.properties ?? {}
  const c = p.city ?? (p.type === 'city' ? p.name : undefined)
  return typeof c === 'string' ? c.trim().toLowerCase() : ''
}
export function comparePhotonTop1(self: PhotonFeature | undefined, komoot: PhotonFeature | undefined) {
  if (!self && !komoot) return { bothEmpty: true, top1_250m: true, sameCountry: true, sameCity: true }
  if (!self || !komoot) return { bothEmpty: false, top1_250m: false, sameCountry: false, sameCity: false }
  const a = self.geometry?.coordinates
  const b = komoot.geometry?.coordinates
  const near = !!a && !!b && haversineM(a, b) <= 250
  const cc = (f: PhotonFeature) => String(f.properties?.countrycode ?? '').toUpperCase()
  return { bothEmpty: false, top1_250m: near, sameCountry: cc(self) === cc(komoot), sameCity: cityOf(self) === cityOf(komoot) }
}

// ---- transport --------------------------------------------------------------
function retriable(r: PhotonResult): boolean {
  return r.status === 0 || r.status === 403 || r.status === 429 || r.status >= 500
}

async function call(
  cfg: PhotonConfig,
  upstream: PhotonUpstream,
  endpoint: PhotonEndpoint,
  params: URLSearchParams,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<PhotonResult> {
  const base = upstream === 'self' ? cfg.primaryUrl! : cfg.fallbackUrl
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  if (upstream === 'self' && cfg.accessId && cfg.accessSecret) {
    headers['CF-Access-Client-Id'] = cfg.accessId
    headers['CF-Access-Client-Secret'] = cfg.accessSecret
  }
  const t0 = now()
  const timeout = AbortSignal.timeout(timeoutMs)
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout
  const done = (status: number, data: PhotonCollection | null, reason?: string): PhotonResult => ({
    ok: status >= 200 && status < 300 && data !== null,
    status, data, upstream, fallback: false, ms: Math.max(0, now() - t0), ...(reason ? { reason } : {}),
  })
  let res: Response
  try {
    res = await fetchImpl(`${base}/${endpoint}?${params}`, { headers, signal: sig, redirect: 'manual' })
  } catch (e) {
    return done(0, null, timeout.aborted ? 'timeout' : signal?.aborted ? 'aborted' : (e instanceof Error ? e.name : 'fetch_error'))
  }
  // Cloudflare Access answers a missing/bad token with a 302 to its login page.
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel()
    return done(403, null, 'access_redirect')
  }
  if (!res.ok) {
    await res.body?.cancel()
    return done(res.status, null, `http_${res.status}`)
  }
  try {
    const data = (await res.json()) as PhotonCollection
    if (!data || !Array.isArray(data.features)) return done(502, null, 'bad_shape')
    return done(res.status, data)
  } catch {
    return done(502, null, 'bad_json')
  }
}

async function shadow(
  cfg: PhotonConfig, caller: string, endpoint: PhotonEndpoint, params: URLSearchParams, komoot: PhotonResult,
): Promise<void> {
  if (!(await selfAllowed())) return
  const s = await call(cfg, 'self', endpoint, params, cfg.primaryTimeoutMs, undefined)
  if (s.ok) selfSucceeded()
  else if (retriable(s)) selfFailed(s.reason ?? `http_${s.status}`)
  noteRequest(caller, endpoint, 'shadow', s)
  if (!s.ok || !komoot.ok) return
  const m = row(caller, endpoint, 'shadow', 'self')
  const c = comparePhotonTop1(s.data?.features?.[0], komoot.data?.features?.[0])
  m.shadow_compared++
  if (c.bothEmpty) m.shadow_both_empty++
  if (c.top1_250m) m.shadow_top1_250m++
  if (c.sameCountry) m.shadow_same_country++
  if (c.sameCity) m.shadow_same_city++
}

async function request(endpoint: PhotonEndpoint, params: URLSearchParams, caller: string, signal?: AbortSignal): Promise<PhotonResult> {
  const cfg = photonConfigFrom(getEnv)
  if (cfg.mode === 'primary' && (await selfAllowed())) {
    const r = await call(cfg, 'self', endpoint, params, cfg.primaryTimeoutMs, signal)
    if (r.ok || !retriable(r) || signal?.aborted) {
      if (r.ok) selfSucceeded()
      noteRequest(caller, endpoint, cfg.mode, r)
      return r
    }
    selfFailed(r.reason ?? `http_${r.status}`)
    noteRequest(caller, endpoint, cfg.mode, r)
  }
  const k = await call(cfg, 'komoot', endpoint, params, cfg.fallbackTimeoutMs, signal)
  if (cfg.mode === 'primary') k.fallback = true
  noteRequest(caller, endpoint, cfg.mode, k)
  if (cfg.mode === 'shadow') bg(shadow(cfg, caller, endpoint, params, k))
  return k
}

// en/de/fr only: Photon answers any other lang (it included) with HTTP 400.
const LANGS = new Set(['en', 'de', 'fr'])
function setCommon(p: URLSearchParams, lang?: string, limit?: number) {
  if (lang && LANGS.has(lang)) p.set('lang', lang)
  if (limit !== undefined) p.set('limit', String(Math.max(1, Math.min(20, Math.trunc(limit)))))
}

/** Forward geocode. Returns raw Photon GeoJSON plus which upstream answered. */
export function photonSearch(q: string, opts: PhotonSearchOpts): Promise<PhotonResult> {
  const p = new URLSearchParams({ q })
  setCommon(p, opts.lang, opts.limit)
  if (Number.isFinite(opts.lat) && Number.isFinite(opts.lon)) {
    p.set('lat', String(opts.lat))
    p.set('lon', String(opts.lon))
  }
  if (opts.countryCode && /^[a-z]{2}$/i.test(opts.countryCode)) p.set('countrycode', opts.countryCode.toLowerCase())
  return request('api', p, opts.caller, opts.signal)
}

/** Reverse geocode. */
export function photonReverse(lat: number, lon: number, opts: PhotonReverseOpts): Promise<PhotonResult> {
  const p = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  setCommon(p, opts.lang, opts.limit)
  return request('reverse', p, opts.caller, opts.signal)
}

/**
 * Ask ONE named upstream directly, bypassing mode, breaker and metrics. For the
 * admin golden-set probe only; returns null when that upstream is not configured.
 */
export function photonProbe(
  upstream: PhotonUpstream,
  endpoint: PhotonEndpoint,
  params: Record<string, string>,
): Promise<PhotonResult> | null {
  const cfg = photonConfigFrom(getEnv)
  if (upstream === 'self' && !cfg.primaryUrl) return null
  const timeout = upstream === 'self' ? cfg.primaryTimeoutMs * 4 : cfg.fallbackTimeoutMs
  return call(cfg, upstream, endpoint, new URLSearchParams(params), timeout, undefined)
}

/** Delay a batch caller should wait before its next request to `upstream`. */
export function photonThrottleMs(upstream: PhotonUpstream): number {
  const cfg = photonConfigFrom(getEnv)
  return upstream === 'self' ? cfg.selfIntervalMs : cfg.komootIntervalMs
}
