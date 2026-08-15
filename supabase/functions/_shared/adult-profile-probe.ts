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
export const DEFAULT_PLATFORMS: PlatformKey[] = ['pornhub']

/**
 * Wikidata occupations (P106) that make encyclopedic provenance CORROBORATING
 * rather than a warning sign.
 *
 * The encyclopedic gate exists because a Wikidata/Wikipedia-sourced row is
 * likely to hold a person's REAL name, where a name-only match against a porn
 * directory is defamation-adjacent. But when Wikidata itself documents the
 * person's occupation as pornographic, their adult career IS their public
 * notability — the encyclopedic source is evidence FOR the link, not against.
 *
 * Measured over the 431 distinct QIDs sitting in the encyclopedic review
 * queue: 408 (95%) carry Q488111. The other frequent occupations were `model`,
 * `actor`, `film actor`, `erotic photography model`, `go-go dancer` — none of
 * which establish adult performance, so they stay gated. Only the two whose
 * label is explicitly "pornographic" are accepted.
 */
export const ADULT_OCCUPATION_QIDS = new Set([
  'Q488111', // pornographic actor
  'Q17456089', // pornographic film director
])

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
  /**
   * Wikidata's own P106 documents this person as a pornographic actor or
   * director. When true, encyclopedic provenance corroborates the link instead
   * of warning against it — see ADULT_OCCUPATION_QIDS.
   */
  documentedAdultPerformer?: boolean
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
  const { name, encyclopedic, documentedAdultPerformer, singleToken, probe } = input

  if (!probe.hit) return { tier: 'miss', reason: 'not_found', confidence: 0 }

  const ours = normalizeName(name)
  const theirs = probe.displayName ? normalizeName(probe.displayName) : ''
  const nameMatches = theirs.length > 0 && theirs === ours

  // ── Order matters ─────────────────────────────────────────────────────────
  // The encyclopedic check is LAST. It used to sit second and short-circuit,
  // which meant an encyclopedic row was never tested for an ambiguous name or
  // a self-registered profile — so relaxing it in place would have let those
  // two weaker cases through unchecked. Every row now clears the identity
  // checks before provenance is even considered.

  if (!nameMatches) {
    return { tier: 'review', reason: 'display_name_mismatch', confidence: 0.4 }
  }
  if (singleToken || ours.replace(/\s/g, '').length < 4) {
    return { tier: 'review', reason: 'ambiguous_name', confidence: 0.5 }
  }
  if (!probe.curated) {
    // Self-registered account — could be a fan or an uploader, not the person.
    return { tier: 'review', reason: 'self_registered_profile', confidence: 0.6 }
  }
  if (encyclopedic && !documentedAdultPerformer) {
    // Wikidata/Wikipedia provenance with NO documented adult occupation: this
    // is very likely a real name, where a name-only match is defamatory if
    // wrong. Wikidata saying "pornographic actor" is what lifts this.
    return { tier: 'review', reason: 'encyclopedic_provenance', confidence: 0.6 }
  }
  return {
    tier: 'auto',
    reason: documentedAdultPerformer
      ? 'exact_name_match_curated_directory_wikidata_corroborated'
      : 'exact_name_match_curated_directory',
    confidence: documentedAdultPerformer ? 0.97 : 0.95,
  }
}

/**
 * Fetch P106 occupations for a batch of QIDs and return the subset Wikidata
 * documents as adult performers.
 *
 * Fails CLOSED: any error yields an empty set, so those rows keep the
 * encyclopedic gate and go to review rather than auto-applying on a network
 * hiccup.
 */
export async function fetchAdultPerformerQids(
  qids: string[],
  fetchJson: (url: string) => Promise<unknown> = async (url) =>
    await (await fetch(url, { headers: { 'User-Agent': 'queer-guide/1.0' } })).json(),
): Promise<Set<string>> {
  const out = new Set<string>()
  const valid = [...new Set(qids.filter((q) => /^Q\d+$/.test(q)))]
  for (let i = 0; i < valid.length; i += 50) {
    const batch = valid.slice(i, i + 50)
    try {
      const data = (await fetchJson(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}` +
          `&props=claims&format=json`,
      )) as { entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>> }> }
      for (const [qid, ent] of Object.entries(data?.entities ?? {})) {
        const occupations = (ent?.claims?.['P106'] ?? [])
          .map((c) => c?.mainsnak?.datavalue?.value?.id)
          .filter((v): v is string => typeof v === 'string')
        if (occupations.some((o) => ADULT_OCCUPATION_QIDS.has(o))) out.add(qid)
      }
    } catch {
      // fail closed — leave this batch out, they stay review-gated
    }
  }
  return out
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
