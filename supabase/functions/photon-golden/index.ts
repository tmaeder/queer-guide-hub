// Admin-only golden-set probe: asks BOTH Photon upstreams (our NAS via the
// Cloudflare tunnel, and komoot) the same fixed queries and reports agreement
// and latency. Used for the rollout checkpoints (docs/geocoding.md).
// The queries below are our own fixed test strings, not user input, so they may
// be returned in the response. Nothing is logged.

import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { comparePhotonTop1, photonProbe, type PhotonEndpoint, type PhotonResult } from '../_shared/photon-client.ts'

type Probe = { label: string; endpoint: PhotonEndpoint; params: Record<string, string> }
const s = (label: string, q: string, extra: Record<string, string> = {}): Probe =>
  ({ label, endpoint: 'api', params: { q, limit: '5', ...extra } })
const r = (label: string, lat: number, lon: number, lang = 'en'): Probe =>
  ({ label, endpoint: 'reverse', params: { lat: String(lat), lon: String(lon), lang } })

export const GOLDEN: Probe[] = [
  // Swiss addresses
  s('ch-langstrasse', 'Langstrasse 145, Zürich', { lang: 'de' }),
  s('ch-bahnhofstrasse', 'Bahnhofstrasse 1, 8001 Zürich', { lang: 'de' }),
  s('ch-bern-bundesplatz', 'Bundesplatz 3, Bern', { lang: 'de' }),
  s('ch-geneva-rue', 'Rue du Rhône 42, Genève', { lang: 'fr' }),
  s('ch-lausanne', 'Avenue de la Gare 10, Lausanne', { lang: 'fr' }),
  s('ch-lugano', 'Via Nassa 5, Lugano', { lang: 'it' }),
  s('ch-basel', 'Steinenvorstadt 30, Basel', { lang: 'de' }),
  s('ch-postcode', '8004 Zürich', { lang: 'de' }),
  // Top cities
  s('city-berlin', 'Berlin', { lang: 'en' }),
  s('city-london', 'London', { lang: 'en' }),
  s('city-paris', 'Paris', { lang: 'fr' }),
  s('city-amsterdam', 'Amsterdam', { lang: 'en' }),
  s('city-barcelona', 'Barcelona', { lang: 'en' }),
  s('city-madrid', 'Madrid', { lang: 'en' }),
  s('city-new-york', 'New York', { lang: 'en' }),
  s('city-san-francisco', 'San Francisco', { lang: 'en' }),
  s('city-tel-aviv', 'Tel Aviv', { lang: 'en' }),
  s('city-bangkok', 'Bangkok', { lang: 'en' }),
  s('city-sao-paulo', 'São Paulo', { lang: 'en' }),
  s('city-mexico', 'Mexico City', { lang: 'en' }),
  s('city-sydney', 'Sydney', { lang: 'en' }),
  s('city-toronto', 'Toronto', { lang: 'en' }),
  s('city-cologne', 'Köln', { lang: 'de' }),
  s('city-vienna', 'Wien', { lang: 'de' }),
  s('city-gran-canaria', 'Maspalomas', { lang: 'en' }),
  s('city-sitges', 'Sitges', { lang: 'en' }),
  // Ambiguous names — lang changes the ranking
  s('amb-zurich-en', 'Zurich', { lang: 'en' }),
  s('amb-zurich-none', 'Zurich'),
  s('amb-derby', 'Derby', { lang: 'en' }),
  s('amb-florence', 'Florence', { lang: 'en' }),
  s('amb-saint-augustine', 'Saint Augustine', { lang: 'en' }),
  s('amb-portland', 'Portland', { lang: 'en' }),
  s('amb-cambridge', 'Cambridge', { lang: 'en' }),
  s('amb-zurich-biased', 'Zurich', { lang: 'en', lat: '38.2', lon: '-97.4' }),
  s('amb-typo-zuirch', 'Zuirch', { lang: 'en' }),
  s('amb-typo-berln', 'Berln', { lang: 'en' }),
  // Non-Latin scripts
  s('nl-tokyo', '東京', {}),
  s('nl-moscow', 'Москва', {}),
  s('nl-athens', 'Αθήνα', {}),
  s('nl-tel-aviv-he', 'תל אביב', {}),
  s('nl-cairo', 'القاهرة', {}),
  s('nl-seoul', '서울', {}),
  s('nl-shinjuku', '新宿二丁目', {}),
  // Venues / POIs
  s('poi-stonewall', 'Stonewall Inn, New York', { lang: 'en' }),
  s('poi-berghain', 'Berghain, Berlin', { lang: 'en' }),
  // Reverse
  r('rev-zurich', 47.3769, 8.5417, 'de'),
  r('rev-berlin', 52.52, 13.405),
  r('rev-sf-castro', 37.7609, -122.435),
  r('rev-tokyo', 35.6895, 139.6917),
  r('rev-buenos-aires', -34.6037, -58.3816),
]

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
