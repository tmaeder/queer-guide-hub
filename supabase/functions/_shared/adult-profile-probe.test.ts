import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  DEFAULT_PLATFORMS,
  PLATFORM_KEYS,
  decideTier,
  displayNameFromTitle,
  extractTitle,
  nextMissState,
  normalizeName,
  probeProfile,
  slugifyName,
  type Fetcher,
  type ProbeResult,
} from './adult-profile-probe.ts'

// ── Title parsing — every fixture below was captured from the live sites ─────

Deno.test('displayNameFromTitle handles all three platforms real titles', () => {
  const cases: [string, string][] = [
    ['Pierre Fitch Gay Porn Videos - Verified Pornstar Profile | Pornhub', 'Pierre Fitch'],
    ['Zeb Atlas Porn Videos | Pornhub.com', 'Zeb Atlas'],
    ['Rico Loko Porn Videos 2026: Porn Star Sex Scenes | xHamster', 'Rico Loko'],
    ['Rocco-Steele - Profile page - XVIDEOS.COM', 'Rocco-Steele'],
    ['Sunny Colucci - Pornstar page - XVIDEOS.COM', 'Sunny Colucci'],
  ]
  for (const [title, expected] of cases) {
    assertEquals(displayNameFromTitle(title), expected, title)
  }
})

Deno.test('extractTitle tolerates the `<title >` xhamster emits', () => {
  assertEquals(extractTitle('<html><head><title >Rico Loko | xHamster</title>'), 'Rico Loko | xHamster')
  assertEquals(extractTitle('<title>A &#124; B</title>'), 'A | B')
  assertEquals(extractTitle('<html><body>no title</body></html>'), null)
})

Deno.test('normalizeName makes a slug and a display name comparable', () => {
  assertEquals(normalizeName('Rocco-Steele'), 'rocco steele')
  assertEquals(normalizeName('Rocco Steele'), 'rocco steele')
  assertEquals(normalizeName("Johnson O'Grady"), 'johnson ogrady')
  assertEquals(normalizeName('José Álvarez'), 'jose alvarez')
})

Deno.test('slugifyName matches the platforms own slugging', () => {
  assertEquals(slugifyName('Pierre Fitch'), 'pierre-fitch')
  assertEquals(slugifyName("Johnson O'Grady"), 'johnson-ogrady')
  assertEquals(slugifyName('Zeb  Atlas '), 'zeb-atlas')
})

// ── Nightly platform set ────────────────────────────────────────────────────

Deno.test('the nightly set excludes xhamster but the prober still supports it', () => {
  // ~3% hit rate for a third of the probe traffic on this gay-male corpus.
  assertEquals(DEFAULT_PLATFORMS.includes('xhamster'), false)
  assertEquals(DEFAULT_PLATFORMS, ['pornhub', 'xvideos'])
  // Still fully probeable on demand — the capability is not removed.
  assertEquals(PLATFORM_KEYS.includes('xhamster'), true)
})

// ── The redirect rule ───────────────────────────────────────────────────────

function fetcherFrom(map: Record<string, { status: number; location?: string; body?: string }>): Fetcher {
  return (url) => {
    const r = map[url]
    if (!r) throw new Error(`unexpected fetch: ${url}`)
    return Promise.resolve({ status: r.status, location: r.location ?? null, body: r.body ?? '' })
  }
}

Deno.test('pornhub: a 301 is a MISS, never a hit (it bounces to the index)', async () => {
  const res = await probeProfile('pornhub', 'Nobody Here', fetcherFrom({
    'https://www.pornhub.com/pornstar/nobody-here': {
      status: 301,
      location: 'https://www.pornhub.com/pornstars',
    },
  }))
  assertEquals(res.hit, false)
})

Deno.test('pornhub: a 200 is a hit in the curated directory', async () => {
  const res = await probeProfile('pornhub', 'Pierre Fitch', fetcherFrom({
    'https://www.pornhub.com/pornstar/pierre-fitch': {
      status: 200,
      body: '<title>Pierre Fitch Gay Porn Videos - Verified Pornstar Profile | Pornhub</title>',
    },
  }))
  assertEquals(res.hit, true)
  assertEquals(res.url, 'https://www.pornhub.com/pornstar/pierre-fitch')
  assertEquals(res.displayName, 'Pierre Fitch')
  assertEquals(res.curated, true)
})

Deno.test('xhamster: /creators 301 to /pornstars is a hit and yields the canonical URL', async () => {
  const res = await probeProfile('xhamster', 'Rico Loko', fetcherFrom({
    'https://xhamster.com/creators/rico-loko': {
      status: 301,
      location: 'https://xhamster.com/pornstars/rico-loko',
    },
    'https://xhamster.com/pornstars/rico-loko': {
      status: 200,
      body: '<title >Rico Loko Porn Videos 2026: Porn Star Sex Scenes | xHamster</title>',
    },
  }))
  assertEquals(res.hit, true)
  assertEquals(res.url, 'https://xhamster.com/pornstars/rico-loko')
  assertEquals(res.displayName, 'Rico Loko')
  assertEquals(res.curated, true)
})

Deno.test('xhamster: a 404 is a miss', async () => {
  const res = await probeProfile('xhamster', 'Zeb Atlas', fetcherFrom({
    'https://xhamster.com/creators/zeb-atlas': { status: 404 },
  }))
  assertEquals(res.hit, false)
})

Deno.test('xhamster: an off-site redirect is never followed', async () => {
  const res = await probeProfile('xhamster', 'Evil Redirect', fetcherFrom({
    'https://xhamster.com/creators/evil-redirect': {
      status: 301,
      location: 'https://attacker.example.com/xhamster.com/pornstars/x',
    },
  }))
  assertEquals(res.hit, false)
})

Deno.test('xvideos: /profiles 301 to /models is a hit; Pornstar page is curated', async () => {
  const res = await probeProfile('xvideos', 'Sunny Colucci', fetcherFrom({
    'https://www.xvideos.com/profiles/sunny-colucci': {
      status: 301,
      location: 'https://www.xvideos.com/models/sunny-colucci',
    },
    'https://www.xvideos.com/models/sunny-colucci': {
      status: 200,
      body: '<title>Sunny Colucci - Pornstar page - XVIDEOS.COM</title>',
    },
  }))
  assertEquals(res.hit, true)
  assertEquals(res.curated, true)
})

Deno.test('xvideos: a self-registered Profile page is a hit but NOT curated', async () => {
  const res = await probeProfile('xvideos', 'Scott Williams', fetcherFrom({
    'https://www.xvideos.com/profiles/scott-williams': {
      status: 200,
      body: '<title>Scott-Williams - Profile page - XVIDEOS.COM</title>',
    },
  }))
  assertEquals(res.hit, true)
  assertEquals(res.curated, false)
})

Deno.test('xvideos: "Unknown profile" is a miss even on a 200', async () => {
  const res = await probeProfile('xvideos', 'Colin Bryant', fetcherFrom({
    'https://www.xvideos.com/profiles/colin-bryant': {
      status: 200,
      body: '<title>Unknown profile - XVIDEOS.COM</title>',
    },
  }))
  assertEquals(res.hit, false)
})

// ── Tiering — the safety gate ───────────────────────────────────────────────

const curatedHit = (displayName: string): ProbeResult => ({
  hit: true, url: 'https://example.test/x', displayName, curated: true,
})

Deno.test('auto tier requires an exact name match in a curated directory', () => {
  const d = decideTier({
    name: 'Pierre Fitch', encyclopedic: false, singleToken: false,
    probe: curatedHit('Pierre Fitch'),
  })
  assertEquals(d.tier, 'auto')
})

Deno.test('a Wikidata/Wikipedia-sourced row NEVER auto-applies', () => {
  // "David Villa" is in this corpus AND is a famous footballer's name.
  const d = decideTier({
    name: 'David Villa', encyclopedic: true, singleToken: false,
    probe: curatedHit('David Villa'),
  })
  assertEquals(d.tier, 'review')
  assertEquals(d.reason, 'encyclopedic_provenance')
})

Deno.test('a single-token name never auto-applies', () => {
  const d = decideTier({
    name: 'Lukas', encyclopedic: false, singleToken: true, probe: curatedHit('Lukas'),
  })
  assertEquals(d.tier, 'review')
  assertEquals(d.reason, 'ambiguous_name')
})

Deno.test('a display-name mismatch never auto-applies', () => {
  const d = decideTier({
    name: 'Chris Allen', encyclopedic: false, singleToken: false,
    probe: curatedHit('Christopher Allender'),
  })
  assertEquals(d.tier, 'review')
  assertEquals(d.reason, 'display_name_mismatch')
})

Deno.test('a missing display name is a mismatch, not a pass', () => {
  const d = decideTier({
    name: 'Chris Allen', encyclopedic: false, singleToken: false,
    probe: { hit: true, url: 'https://example.test/x', curated: true },
  })
  assertEquals(d.tier, 'review')
})

Deno.test('a self-registered profile never auto-applies', () => {
  const d = decideTier({
    name: 'Scott Williams', encyclopedic: false, singleToken: false,
    probe: { hit: true, url: 'https://example.test/x', displayName: 'Scott-Williams', curated: false },
  })
  assertEquals(d.tier, 'review')
  assertEquals(d.reason, 'self_registered_profile')
})

Deno.test('dash-vs-space display names still count as a match', () => {
  // xvideos renders the slug ("Rocco-Steele") rather than the real name.
  assertEquals(normalizeName('Rocco-Steele'), normalizeName('Rocco Steele'))
})

// ── Terminal sentinel ───────────────────────────────────────────────────────

Deno.test('three misses retire a (row, platform) pair permanently', () => {
  const a = nextMissState(null)
  assertEquals(a, { state: 'not_found', attempts: 1 })
  const b = nextMissState(a)
  assertEquals(b, { state: 'not_found', attempts: 2 })
  const c = nextMissState(b)
  assertEquals(c, { state: 'data_unavailable', attempts: 3 })
})
