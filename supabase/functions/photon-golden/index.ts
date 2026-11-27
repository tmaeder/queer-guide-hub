// Admin-only golden-set probe: asks BOTH Photon upstreams (our NAS via the
// Cloudflare tunnel, and komoot) the same fixed queries and reports agreement
// and latency. Used for the rollout checkpoints (docs/geocoding.md).
// The queries below are our own fixed test strings, not user input, so they may
// be returned in the response. Nothing is logged.

import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { comparePhotonTop1, photonProbe, type PhotonEndpoint, type PhotonResult } from '../_shared/photon-client.ts'
import { GOLDEN } from './golden.ts'

function top(res: PhotonResult | null) {
  const f = res?.data?.features?.[0]
  if (!f) return null
  const p = f.properties ?? {}
  return { name: p.name ?? null, city: p.city ?? null, countrycode: p.countrycode ?? null, coords: f.geometry?.coordinates ?? null }
}
interface Side { status: number; ms: number; n: number; reason?: string; top: ReturnType<typeof top> }
interface Row { label: string; endpoint: PhotonEndpoint; self: Side; komoot: Side; agree: ReturnType<typeof comparePhotonTop1> }

function pct(xs: number[], q: number): number | null {
  if (!xs.length) return null
  const a = [...xs].sort((x, y) => x - y)
  return a[Math.min(a.length - 1, Math.ceil(q * a.length) - 1)]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const auth = await requireInternalOrAdmin(req, getServiceClient())
  if (auth instanceof Response) return auth
  try {
    const body = await req.json().catch(() => ({}))
    const only: string[] | null = Array.isArray(body.only) ? body.only : null
    const set = only ? GOLDEN.filter((g) => only.includes(g.label)) : GOLDEN
    if (!photonProbe('self', 'api', { q: 'x' })) return errorResponse('PHOTON_PRIMARY_URL is not set', 400, req)

    const rows: Row[] = []
    for (const g of set) {
      // Sequential, and paced for komoot (~1 req/s), so the probe itself is polite.
      const self = await photonProbe('self', g.endpoint, g.params)!
      const komoot = await photonProbe('komoot', g.endpoint, g.params)!
      const c = comparePhotonTop1(self.data?.features?.[0], komoot.data?.features?.[0])
      rows.push({
        label: g.label, endpoint: g.endpoint,
        self: { status: self.status, ms: self.ms, n: self.data?.features?.length ?? 0, reason: self.reason, top: top(self) },
        komoot: { status: komoot.status, ms: komoot.ms, n: komoot.data?.features?.length ?? 0, reason: komoot.reason, top: top(komoot) },
        agree: c,
      })
      await new Promise((res) => setTimeout(res, 1100))
    }
    const ok = rows.filter((x) => x.self.status === 200 && x.komoot.status === 200)
    const lat = (u: 'self' | 'komoot') => rows.filter((x) => x[u].status === 200).map((x) => x[u].ms)
    return jsonResponse({
      queries: rows.length,
      both_ok: ok.length,
      self_errors: rows.filter((x) => x.self.status !== 200).length,
      komoot_errors: rows.filter((x) => x.komoot.status !== 200).length,
      latency_ms: {
        self: { p50: pct(lat('self'), 0.5), p95: pct(lat('self'), 0.95) },
        komoot: { p50: pct(lat('komoot'), 0.5), p95: pct(lat('komoot'), 0.95) },
      },
      agreement: {
        top1_250m: ok.filter((x) => x.agree.top1_250m).length,
        same_country: ok.filter((x) => x.agree.sameCountry).length,
        same_city: ok.filter((x) => x.agree.sameCity).length,
      },
      disagreements: ok.filter((x) => !x.agree.top1_250m || !x.agree.sameCountry).map((x) => ({
        label: x.label, self: x.self.top, komoot: x.komoot.top,
      })),
      rows: body.verbose ? rows : undefined,
    }, 200, req)
  } catch (e) {
    return errorResponse((e as Error).message, 500, req)
  }
})
