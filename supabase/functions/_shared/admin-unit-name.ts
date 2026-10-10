// Geocoder city name → the name to resolve, and whether a NEW city may be minted.
//
// backfill-venue-cities takes Photon's `city` property and hands it to
// city_resolve_or_create, which mints a city when nothing matches. Photon's
// `city` is the municipality's ADMINISTRATIVE label, not always a toponym, and
// measured on 2026-10-09 the 3,950 cities it minted in 40 hours carried:
//   - wrapper words around a real town: "Heraklion Municipal Unit", "Municipal
//     Unit of Patras", "Overstrand Local Municipality", "Chișinău Municipality".
//     The wrapper is what defeated the resolver's name match, so the town was
//     minted a second time beside the existing row (Chișinău, Rhodes, Wexford…);
//   - city SUBDIVISIONS published as cities: "Botanica Sector" (Chișinău),
//     "Cukarica Urban Municipality" (Belgrade), "Chaoyang District", "Zone 9",
//     "Thanh Vinh Ward";
//   - local-script names ("Черкаська міська громада", "חדרה") where `name`
//     must be English;
//   - trailing whitespace ("Ciudad de México ") — a third Mexico City row.
//
// So: wrappers are stripped before matching; subdivisions and non-Latin names
// may only LINK to an existing city, never create one (the resolver refuses
// and the miss goes to the review queue). US/CA "Township", "Parish" and
// "Charter Township" are real municipalities there and are left alone.
//
// Pure, no I/O. Unit-tested in admin-unit-name.test.ts.

export interface AdminUnitName {
  /** Name to resolve: trimmed, wrapper words removed. */
  name: string
  /** False when the label names a part of a city or is not in Latin script. */
  allowCreate: boolean
  /** Why creation is refused; null when allowed. */
  reason: 'subdivision' | 'non_latin_name' | null
}

const PREFIX =
  /^(?:the\s+)?(?:municipal\s+unit|municipal\s+district|borough\s+district|municipality|town|city|district|county)\s+of\s+/i

const SUFFIX =
  /\s+(?:municipal\s+unit|local\s+municipality|district\s+municipality|metropolitan\s+municipality|municipality|municipal\s+borough\s+district|municipal\s+district|metropolitan\s+district)$/i

// A label naming a PART of a city. Checked on the cleaned name, so
// "Botanica Sector" and "Cukarica Urban Municipality" both land here.
const SUBDIVISION =
  /(?:\b(?:sector|ward|subdistrict|sub-district|urban\s+municipality|community|district|arrondissement|borough)$|^zone\s+\d+$|\bcentral\s+business\s+district\b|\bsector\s+)/i

/**
 * True when every letter is Latin script (accents fine: "Chișinău", "Žilina").
 * Script=Common letters are allowed too: the Polynesian ʻokina in "Hitiaʻa ʻo
 * te Rā" is a letter with no script of its own.
 */
export function isLatinName(name: string): boolean {
  const letters = name.match(/\p{L}/gu) ?? []
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch))
  return latin.length > 0 && letters.every((ch) => /[\p{Script=Latin}\p{Script=Common}]/u.test(ch))
}

export function classifyGeocodedCityName(raw: string): AdminUnitName {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  if (!isLatinName(trimmed)) return { name: trimmed, allowCreate: false, reason: 'non_latin_name' }

  // "Urban Municipality" is a subdivision, not a wrapper — test before stripping.
  if (/\burban\s+municipality$/i.test(trimmed)) {
    return { name: trimmed, allowCreate: false, reason: 'subdivision' }
  }

  const stripped = trimmed.replace(PREFIX, '').replace(SUFFIX, '').trim() || trimmed
  if (SUBDIVISION.test(stripped)) return { name: stripped, allowCreate: false, reason: 'subdivision' }
  return { name: stripped, allowCreate: true, reason: null }
}
