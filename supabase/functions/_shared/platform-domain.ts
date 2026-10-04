/**
 * Is this website the entity's OWN site, or a platform it merely has a page on?
 *
 * `enrich-logos` probes logo.dev with the registrable domain of a row's
 * `website`. For much of this corpus that website is a Facebook page, a
 * shortened link, a free site-builder subdomain or a directory listing — so
 * logo.dev was asked for facebook.com / tinyurl.com / blogspot.com and answered
 * correctly, with those companies' marks. Measured before this guard existed:
 * one image was attached to 558 venues (Facebook's "f"), another to 381
 * (TinyURL's wordmark), and 4,169 of 4,306 events carried GayCities' logo.
 *
 * THE VOCABULARY IS NOT IN THIS FILE. It lives in `public.logo_platform_domains`
 * and is loaded once per batch. Three readers need the same rule — this
 * producer, the repair migration and `logo_platform_signals()` — and a
 * hardcoded TS array beside a SQL copy is exactly the drift this repo has had
 * to repair in `venueCategories`, `death_penalty_risk` and the accessibility
 * vocabulary. Keeping the list in one table also means blocking a
 * newly-discovered platform is one INSERT: no migration, no deploy.
 *
 * Only the MATCHING is duplicated, and deliberately kept to the two rules the
 * SQL uses, so the pair is small enough to hold in one's head and is covered by
 * `platform-domain.test.ts`.
 */

export type PlatformClass = 'social' | 'shortener' | 'builder' | 'aggregator' | 'parking'

export interface PlatformRule {
  value: string
  match_mode: 'label' | 'suffix'
  class: PlatformClass
}

/** Host of a website url: scheme and path stripped, `www.` removed, lowercased. */
export function websiteHost(url: string | null | undefined): string | null {
  if (!url) return null
  const host = url
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]
    .toLowerCase()
    .replace(/^www\./, '')
  return host || null
}

/**
 * The platform class of a website, or null when it looks like the entity's own
 * site. A non-null answer means a logo probed from this url would belong to the
 * PLATFORM, not to the entity.
 *
 * `label` matches a WHOLE dot-separated label, which is what lets one rule cover
 * Blogger's six TLDs in this corpus (blogspot.com/.de/.gr/.it/.co.uk/.com.ar)
 * while still refusing `facebooks.com` — a real typosquat here — and a bar at
 * `instagram-bar.com`. `suffix` is anchored on a dot so `notbit.ly` cannot pass
 * as `bit.ly`.
 */
export function platformWebsiteClass(
  url: string | null | undefined,
  rules: readonly PlatformRule[],
): PlatformClass | null {
  const host = websiteHost(url)
  if (!host) return null
  const labels = host.split('.')
  for (const rule of rules) {
    if (rule.match_mode === 'label') {
      if (labels.includes(rule.value)) return rule.class
    } else if (host === rule.value || host.endsWith(`.${rule.value}`)) {
      return rule.class
    }
  }
  return null
}

/**
 * Load the vocabulary once per batch.
 *
 * Throws rather than returning an empty list on a read failure. An empty
 * vocabulary silently disables the guard, and the whole point of this module is
 * that a logo nobody checked gets published to thousands of rows — "could not
 * look" must not read as "nothing to block".
 */
export async function loadPlatformRules(
  // Structural, not `SupabaseClient`: the only thing needed is one select, and
  // a narrow shape lets the test drive it with a fake. `PromiseLike` rather than
  // `Promise` because PostgrestFilterBuilder is a thenable, not a Promise.
  supabase: {
    from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown; error: unknown }> }
  },
): Promise<PlatformRule[]> {
  const { data, error } = await supabase.from('logo_platform_domains').select('value, match_mode, class')
  if (error) throw new Error(`logo_platform_domains: ${(error as { message?: string }).message ?? error}`)
  const rules = (data ?? []) as PlatformRule[]
  if (rules.length === 0) throw new Error('logo_platform_domains is empty — the platform guard would be a no-op')
  return rules
}
