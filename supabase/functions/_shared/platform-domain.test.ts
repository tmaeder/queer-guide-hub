import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  platformWebsiteClass,
  websiteHost,
  loadPlatformRules,
  loadDeniedMarks,
  logoMarkSha256,
  type PlatformRule,
} from './platform-domain.ts'

/**
 * The rules below mirror rows seeded by `99991791144831_platform_domain_logos.sql`.
 * Only the MATCHING is under test here — the vocabulary itself is a database
 * table precisely so it cannot drift from a copy in source.
 */
const RULES: PlatformRule[] = [
  { value: 'facebook', match_mode: 'label', class: 'social' },
  { value: 'instagram', match_mode: 'label', class: 'social' },
  { value: 'blogspot', match_mode: 'label', class: 'builder' },
  { value: 'gaycities', match_mode: 'label', class: 'aggregator' },
  { value: 'wix', match_mode: 'label', class: 'builder' },
  { value: 'tinyurl', match_mode: 'label', class: 'shortener' },
  { value: 'bit.ly', match_mode: 'suffix', class: 'shortener' },
  { value: 'business.site', match_mode: 'suffix', class: 'builder' },
  { value: 'free.fr', match_mode: 'suffix', class: 'builder' },
  { value: 'x.com', match_mode: 'suffix', class: 'social' },
  { value: 'display-magazin.ch', match_mode: 'suffix', class: 'aggregator' },
]

Deno.test('websiteHost strips scheme, path and www', () => {
  assertEquals(websiteHost('https://www.facebook.com/proseccobar.muenchen'), 'facebook.com')
  assertEquals(websiteHost('HTTP://Example.COM/a/b?c=d'), 'example.com')
  assertEquals(websiteHost('tinyurl.com/abc'), 'tinyurl.com')
  assertEquals(websiteHost(''), null)
  assertEquals(websiteHost(null), null)
})

Deno.test('the measured offenders are all caught', () => {
  // Each of these was attached to real rows on prod; the counts are from the
  // measurement that motivated the guard.
  const cases: [string, string][] = [
    ['https://www.facebook.com/AmadeusKoeln', 'social'], // 565 venues
    ['https://m.facebook.com/somebar', 'social'],
    ['https://www.instagram.com/bar106', 'social'], // 138 venues
    ['https://tinyurl.com/y7x8', 'shortener'], // 381 venues
    ['http://bit.ly/2abc', 'shortener'], // 22 venues
    ['https://denver.gaycities.com/bars/123', 'aggregator'], // 4,169 events
    ['https://atrevetebar.blogspot.com', 'builder'],
    ['https://babilonalmeria.blogspot.de', 'builder'], // same rule, different TLD
    ['https://termasplataforma.blogspot.co.uk', 'builder'], // and a multi-part TLD
    ['https://fluxbarbuenosaires.blogspot.com.ar', 'builder'],
    ['https://boys-bar-gay.business.site', 'builder'],
    ['https://kipfer-lover.negocio.site', 'builder'], // seeded separately
    ['https://bahamas-charleroi.wix.com', 'builder'],
    ['http://babylone72.free.fr', 'builder'],
    ['https://display-magazin.ch/venue/adagio', 'aggregator'], // 320 venues
  ]
  for (const [url, expected] of cases) {
    const got = platformWebsiteClass(url, [
      ...RULES,
      { value: 'negocio.site', match_mode: 'suffix', class: 'builder' },
    ])
    assertEquals(got, expected, `${url} should be ${expected}, got ${got}`)
  }
})

Deno.test('a venue own site is never blocked', () => {
  for (const url of [
    'https://cherrykitten.com',
    'https://axelhotels.com/sky-bar',
    'https://steamworksbaths.com',
    'https://arenadisco.com',
    'https://passporthealthusa.com/clinic',
    'https://merivale.com',
    'https://barberlin.be',
  ]) {
    assertEquals(platformWebsiteClass(url, RULES), null, `${url} must not be blocked`)
  }
})

Deno.test('label mode matches a WHOLE label, so near-misses survive', () => {
  // `facebooks.com` is a real typosquat in this corpus; blocking it on a
  // substring match would be luck rather than a rule, and the same loose match
  // would take a bar legitimately called "instagram-bar".
  assertEquals(platformWebsiteClass('https://facebooks.com', RULES), null)
  assertEquals(platformWebsiteClass('https://instagram-bar.com', RULES), null)
  assertEquals(platformWebsiteClass('https://myfacebook.community', RULES), null)
  assertEquals(platformWebsiteClass('https://wixen-bar.de', RULES), null)
  // ...while the real label still matches at any depth.
  assertEquals(platformWebsiteClass('https://de-de.facebook.com/x', RULES), 'social')
})

Deno.test('suffix mode is anchored on the dot', () => {
  assertEquals(platformWebsiteClass('https://notbit.ly/x', RULES), null)
  assertEquals(platformWebsiteClass('https://bit.ly/x', RULES), 'shortener')
  assertEquals(platformWebsiteClass('https://a.b.bit.ly/x', RULES), 'shortener')
  // `free.fr` is a suffix rule precisely because the label `free` would take
  // every bar in France with "free" in its domain.
  assertEquals(platformWebsiteClass('https://free-bar.fr', RULES), null)
  assertEquals(platformWebsiteClass('https://x.free.fr', RULES), 'builder')
  // `x.com` likewise: the label `x` would match any host with a single-letter part.
  assertEquals(platformWebsiteClass('https://x.com/bar', RULES), 'social')
  assertEquals(platformWebsiteClass('https://x.example.com/bar', RULES), null)
})

Deno.test('an unreadable or empty vocabulary throws rather than disabling the guard', async () => {
  // "Could not look" must never read as "nothing to block" — that is the shape
  // that let a dead logo.dev token write off 6,498 venues as having no logo.
  await assertRejects(
    () =>
      loadPlatformRules({
        from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
      }),
    Error,
    'logo_platform_domains',
  )
  await assertRejects(
    () =>
      loadPlatformRules({
        from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      }),
    Error,
    'empty',
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Second layer: the domain is the entity's own and the IMAGE is still junk.

Deno.test('logoMarkSha256 reads the content hash out of a mirror url', () => {
  const sha = '8bd7d2723083724e7e473263d5d3ea976e001ad3333b6c6cf2c02ae783b2bf02'
  assertEquals(logoMarkSha256(`https://img.queer.guide/logos/${sha}.png`), sha)
  // Anchored on the mirror path. A bare 64-hex match would also fire on a query
  // parameter or a token, which is how an unrelated url becomes "denied".
  assertEquals(logoMarkSha256(`https://example.com/x?token=${sha}`), null)
  assertEquals(logoMarkSha256(`https://img.queer.guide/covers/${sha}.png`), null)
  // Supabase-storage logos are keyed by entity UUID, not content — there is no
  // shared identity to deny, which is why organizations are out of scope.
  assertEquals(
    logoMarkSha256('https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/logos/venues/dce7666e-0bcc-442b-bd26-83410a6811c5.png'),
    null,
  )
  assertEquals(logoMarkSha256(null), null)
})

Deno.test('an unreadable denied-marks table throws, but an EMPTY one is legitimate', async () => {
  // Deliberately asymmetric with loadPlatformRules: the platform vocabulary is
  // seeded up front so empty means broken, while this layer is discovered
  // incrementally from the sentinel's advisory arm and starts out empty.
  await assertRejects(
    () =>
      loadDeniedMarks({
        from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
      }),
    Error,
    'logo_denied_marks',
  )
  const empty = await loadDeniedMarks({
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  })
  assertEquals(empty.size, 0)
})
