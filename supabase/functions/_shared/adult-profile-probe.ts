// adult-profile-probe — pure helpers for resolving an adult performer's
// profile on pornhub / xhamster / xvideos.
//
// Everything here is deliberately side-effect free so it can be unit-tested
// without touching the network; `probeProfile` takes its fetcher as an
// argument. The orchestration lives in personality-link-adult-profiles.
//
// ── The redirect rule is the whole ballgame ─────────────────────────────────
//
// Measured live against a 30-name sample before this was written:
//
//   curl -L  https://www.pornhub.com/pornstar/<any-name>   -> 200, 30/30 "hits"
//   curl     https://www.pornhub.com/pornstar/<real-name>  -> 200
//   curl     https://www.pornhub.com/pornstar/<fake-name>  -> 301 /pornstars
//
// A miss 301s to the *pornstar index*, which is itself a 200 — so FOLLOWING
// REDIRECTS TURNS EVERY MISS INTO A HIT. The real hit rate is 47%, not 100%.
// Same shape as the Overpass "HTTP 200 with an empty body" trap. Every probe
// here uses redirect:'manual' and treats each status explicitly.

export type PlatformKey = 'pornhub' | 'xhamster' | 'xvideos'

/** Every platform this module knows how to probe. */
export const PLATFORM_KEYS: PlatformKey[] = ['pornhub', 'xhamster', 'xvideos']

/**
 * What the NIGHTLY sweep probes.
 *
 * xhamster is deliberately excluded: measured over the first ~1,000 rows of
 * the real cohort it resolved ~3% of names while costing a third of all probe
 * traffic, because its pornstar directory is heavily straight-skewed and this
 * corpus is gay-male. It stays fully supported for on-demand runs — pass
 * `platforms:['xhamster']` (or `--platform xhamster`) and both this function
 * and the selector will include it.
 *
 * This has to be honoured by the SELECTOR, not just the probe loop. If the
 * selector still reported xhamster as missing, a row whose only gap is
 * xhamster would be handed out every night, skipped without a write, and so
 * never have `last_attempt_at` stamped — pinning it to the head of the queue
 * forever. That is the same starvation shape the city engine hit.
 */
export const DEFAULT_PLATFORMS: PlatformKey[] = ['pornhub', 'xvideos']

/** Circuit-breaker name per host — seeded in the engine migration. */
export const BREAKER: Record<PlatformKey, string> = {
  pornhub: 'adult.pornhub',
  xhamster: 'adult.xhamster',
  xvideos: 'adult.xvideos',
}

export interface ProbeResult {
  hit: boolean
  /** Canonical profile URL, namespace included. Only set when `hit`. */
  url?: string
  /** Display name as the platform renders it, for corroboration. */
  displayName?: string
  /**
   * True when the profile lives in the platform's CURATED performer directory
   * rather than a self-registered account. xvideos `/profiles/` pages are
   * anyone-can-register, so a name collision there is far likelier than in
   * pornhub's `/pornstar/` directory.
   */
  curated?: boolean
  /** Set when the probe could not be completed (network/5xx), not a miss. */
  error?: string
}

/** Slug a display name the way these platforms do: lowercase, dash-joined. */
export function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Comparison form: case/diacritic/punctuation-insensitive, dashes are spaces. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_.]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#124;': '|',
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&(?:amp|lt|gt|quot|#39|#124);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
}

/** `<title >` (with a space) is real — xhamster emits it. Stay tolerant. */
export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)
  return m ? decodeEntities(m[1]).trim() : null
}

/**
 * Pull the performer's display name out of a profile page title.
 *
 * Real titles this must handle (all captured live):
 *   Pierre Fitch Gay Porn Videos - Verified Pornstar Profile | Pornhub
 *   Zeb Atlas Porn Videos | Pornhub.com
 *   Rico Loko Porn Videos 2026: Porn Star Sex Scenes | xHamster
 *   Rocco-Steele - Profile page - XVIDEOS.COM
 *   Sunny Colucci - Pornstar page - XVIDEOS.COM
 */
export function displayNameFromTitle(title: string): string {
  let t = decodeEntities(title)
  t = t.split(/\s*[|｜]\s*/)[0]
  t = t.split(/\s+-\s+/)[0]
  t = t.split(/\s*:\s+/)[0]
  t = t.replace(/\s+(?:gay\s+)?porn\s+videos(?:\s+\d{4})?\s*$/i, '')
  t = t.replace(/\s+videos\s*$/i, '')
  return t.trim()
}

export type Fetcher = (url: string) => Promise<{ status: number; location: string | null; body: string }>

/**
 * Probe one platform for one name. Never follows redirects implicitly — each
 * platform's redirect semantics are different and two of the three encode
 * "not found" as a redirect rather than a 404.
 */
export async function probeProfile(
  platform: PlatformKey,
  name: string,
  fetcher: Fetcher,
): Promise<ProbeResult> {
  const slug = slugifyName(name)
  if (slug.length < 2) return { hit: false }

  try {
    if (platform === 'pornhub') {
      // 200 = the profile exists. 3xx = it does not (it bounces to /pornstars).
      const url = `https://www.pornhub.com/pornstar/${slug}`
      const r = await fetcher(url)
      if (r.status !== 200) return { hit: false }
      const title = extractTitle(r.body)
      return {
        hit: true,
        url,
        displayName: title ? displayNameFromTitle(title) : undefined,
        // /pornstar/ IS the curated directory; /model/ and /users/ are not,
        // and we never probe those.
        curated: true,
      }
    }

    if (platform === 'xhamster') {
      // /creators/<slug> resolves aliases: `siri` 301s to /pornstars/siri-dahl.
      // A miss is a clean 404.
      const start = `https://xhamster.com/creators/${slug}`
      let r = await fetcher(start)
      let final = start
      if (r.status === 301 || r.status === 302) {
        if (!r.location) return { hit: false }
        if (!/^https:\/\/(?:[a-z]+\.)?xhamster\.com\/(?:pornstars|creators)\//i.test(r.location)) {
          return { hit: false }
        }
        final = r.location.split('?')[0].replace(/\/$/, '')
        r = await fetcher(final)
      }
      if (r.status !== 200) return { hit: false }
      const title = extractTitle(r.body)
      return {
        hit: true,
        url: final,
        displayName: title ? displayNameFromTitle(title) : undefined,
        curated: /\/pornstars\//i.test(final),
      }
    }

    // xvideos: /profiles/<slug> 301s to the canonical /models/<slug>; a miss
    // is a 404 at the /profiles/ URL. A 200 can still be the "Unknown profile"
    // placeholder, so the title is a second, load-bearing check.
    const start = `https://www.xvideos.com/profiles/${slug}`
    let r = await fetcher(start)
    let final = start
    if (r.status === 301 || r.status === 302) {
      if (!r.location) return { hit: false }
      if (!/^https:\/\/(?:[a-z]+\.)?xvideos\.com\/(?:models|profiles|pornstars)\//i.test(r.location)) {
        return { hit: false }
      }
      final = r.location.split('?')[0].replace(/\/$/, '')
      r = await fetcher(final)
    }
    if (r.status !== 200) return { hit: false }
    const title = extractTitle(r.body)
    if (!title || /unknown profile/i.test(title)) return { hit: false }
    return {
      hit: true,
      url: final,
      displayName: displayNameFromTitle(title),
      // "Pornstar page" = curated entry. "Profile page" = self-registered
      // account, which is where the namesake risk actually lives.
      curated: /pornstar page/i.test(title),
    }
  } catch (e) {
    return { hit: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type Tier = 'auto' | 'review' | 'miss'

export interface TierInput {
  /** Our stored name for the personality. */
  name: string
  /** Row has a wikidata/wikipedia source — i.e. a REAL name, not a stage name. */
  encyclopedic: boolean
  /** Name is a single token ("Lukas") — far too weak to identify a person. */
  singleToken: boolean
  probe: ProbeResult
}

export interface TierDecision {
  tier: Tier
  reason: string
  confidence: number
}

/**
 * Decide what may be written without a human.
 *
 * A 200 proves only that SOME performer uses this stage name. On this corpus
 * 2,751 live adult rows are living people and 1,450 unlinked ones carry
 * Wikidata/Wikipedia provenance — real names, where a name-only match against
 * a porn directory is defamation-adjacent. So the auto tier demands that the
 * platform's own display name matches ours AND that nothing about the row
 * suggests we are holding a real name rather than a stage name.
 */
export function decideTier(input: TierInput): TierDecision {
  const { name, encyclopedic, singleToken, probe } = input

  if (!probe.hit) return { tier: 'miss', reason: 'not_found', confidence: 0 }

  const ours = normalizeName(name)
  const theirs = probe.displayName ? normalizeName(probe.displayName) : ''
  const nameMatches = theirs.length > 0 && theirs === ours

  if (!nameMatches) {
    return { tier: 'review', reason: 'display_name_mismatch', confidence: 0.4 }
  }
  if (encyclopedic) {
    // Wikidata/Wikipedia provenance means this is very likely a real name.
    return { tier: 'review', reason: 'encyclopedic_provenance', confidence: 0.6 }
  }
  if (singleToken || ours.replace(/\s/g, '').length < 4) {
    return { tier: 'review', reason: 'ambiguous_name', confidence: 0.5 }
  }
  if (!probe.curated) {
    // Self-registered account — could be a fan or an uploader, not the person.
    return { tier: 'review', reason: 'self_registered_profile', confidence: 0.6 }
  }
  return { tier: 'auto', reason: 'exact_name_match_curated_directory', confidence: 0.95 }
}

/**
 * Per-platform state written into `enrichment_status.adult_links`.
 *
 * `data_unavailable` after 3 misses is the TERMINAL SENTINEL — the selector
 * excludes it, which is what stops the nightly cron re-probing thousands of
 * names that will never resolve. Ported from the countries/cities engines.
 */
export const MAX_ATTEMPTS = 3

export function nextMissState(prior: unknown): { state: string; attempts: number } {
  const attempts =
    (typeof prior === 'object' && prior !== null && typeof (prior as { attempts?: unknown }).attempts === 'number'
      ? (prior as { attempts: number }).attempts
      : 0) + 1
  return { state: attempts >= MAX_ATTEMPTS ? 'data_unavailable' : 'not_found', attempts }
}
