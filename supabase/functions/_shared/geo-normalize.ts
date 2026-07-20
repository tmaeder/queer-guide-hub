/**
 * Country name canonicalization — dependency-free so lean functions (twenty-sync)
 * can import the alias map without pulling the automation/AI-suggestion stack.
 * automation-utils.ts re-exports COUNTRY_ALIASES from here for its existing users.
 */

/** Canonical country alias map — ISO-2 codes, local names, demonyms → English name. */
export const COUNTRY_ALIASES: Record<string, string> = {
  'us': 'United States', 'usa': 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States',
  'united states of america': 'United States', 'america': 'United States',
  'gb': 'United Kingdom', 'uk': 'United Kingdom', 'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom', 'england': 'United Kingdom', 'scotland': 'United Kingdom',
  'wales': 'United Kingdom', 'britain': 'United Kingdom',
  'de': 'Germany', 'deutschland': 'Germany', 'alemania': 'Germany', 'allemagne': 'Germany',
  'fr': 'France', 'es': 'Spain', 'españa': 'Spain', 'espana': 'Spain',
  'it': 'Italy', 'italia': 'Italy',
  'nl': 'Netherlands', 'holland': 'Netherlands', 'the netherlands': 'Netherlands', 'nederland': 'Netherlands',
  'ch': 'Switzerland', 'schweiz': 'Switzerland', 'suisse': 'Switzerland', 'svizzera': 'Switzerland',
  'at': 'Austria', 'österreich': 'Austria', 'osterreich': 'Austria',
  'au': 'Australia', 'ca': 'Canada', 'br': 'Brazil', 'brasil': 'Brazil',
  'mx': 'Mexico', 'méxico': 'Mexico', 'jp': 'Japan',
  'za': 'South Africa', 'nz': 'New Zealand', 'il': 'Israel',
  'th': 'Thailand', 'pt': 'Portugal', 'be': 'Belgium',
  'se': 'Sweden', 'dk': 'Denmark', 'no': 'Norway', 'fi': 'Finland',
  'ie': 'Ireland', 'cz': 'Czech Republic', 'czechia': 'Czech Republic',
  'tw': 'Taiwan', 'ar': 'Argentina', 'co': 'Colombia',
  'in': 'India', 'cn': 'China', 'kr': 'South Korea', 'ru': 'Russia',
  'tr': 'Turkey', 'türkiye': 'Turkey', 'türkei': 'Turkey', 'turkei': 'Turkey', 'turkiye': 'Turkey',
  'gr': 'Greece', 'pl': 'Poland', 'česko': 'Czech Republic', 'cesko': 'Czech Republic',
  // Demonyms
  'american': 'United States', 'british': 'United Kingdom', 'english': 'United Kingdom',
  'german': 'Germany', 'french': 'France', 'spanish': 'Spain',
  'italian': 'Italy', 'dutch': 'Netherlands', 'swiss': 'Switzerland',
  'austrian': 'Austria', 'australian': 'Australia', 'canadian': 'Canada',
  'brazilian': 'Brazil', 'mexican': 'Mexico', 'japanese': 'Japan',
  'south african': 'South Africa', 'israeli': 'Israel', 'thai': 'Thailand',
  'portuguese': 'Portugal', 'belgian': 'Belgium', 'swedish': 'Sweden',
  'danish': 'Denmark', 'norwegian': 'Norway', 'finnish': 'Finland',
  'irish': 'Ireland', 'czech': 'Czech Republic', 'taiwanese': 'Taiwan',
  'argentinian': 'Argentina', 'colombian': 'Colombia', 'indian': 'India',
  'chinese': 'China', 'korean': 'South Korea', 'russian': 'Russia',
  'turkish': 'Turkey', 'greek': 'Greece', 'polish': 'Poland',
  'filipino': 'Philippines', 'nigerian': 'Nigeria', 'kenyan': 'Kenya',
  'egyptian': 'Egypt', 'moroccan': 'Morocco', 'lebanese': 'Lebanon',
  'jamaican': 'Jamaica', 'cuban': 'Cuba',
}

/**
 * Build a lowercase lookup (name / ISO code / alias → canonical name) from the
 * `countries` table rows plus the alias map.
 */
export function buildCountryCanon(rows: Array<{ name: string | null; code: string | null }>): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of rows) {
    if (!c.name) continue
    m.set(c.name.toLowerCase(), c.name)
    if (c.code) m.set(c.code.toLowerCase(), c.name)
  }
  for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) {
    if (!m.has(alias)) m.set(alias, name)
  }
  return m
}
