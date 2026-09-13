// Physical bounds for the dimensioned city/country scalars.
//
// ONE definition, imported by every layer that needs it:
//   _shared/venue-pipeline-utils.ts    the staging path (pipeline-validate)
//   city-factual-backfill/index.ts     the direct-write path (the real producer)
//   public.city_scalar_defects()       the corpus gate (drift-tested against this file)
//
// It lives in its own module because the alternative is three copies, and the
// review that produced this file found a drift test that could not tell a real
// bound from the same number appearing in a comment. Copies rot; imports cannot.
//
// WHY THESE NUMBERS. Until 2026-09-08 `area_km2` and `elevation_m` had no
// plausibility check anywhere, on any path, and population was checked only for
// `isFinite && >= 0`. Measured on prod:
//
//   El Reno, US                area  8,300,000,226 km2
//   City of Hamilton, BM       area  1,138,110,000 km2   (~7x Earth's land area)
//   Calgary, CA                area    825,290,000 km2   (real: 825.29)
//   Maui, US                   elevation    10,023 m     (above Everest)
//   Norfolk, US                population 343,000,000    (above the entire US)
//
// Each bound sits OUTSIDE the largest real value, and the real value is named so
// a future reader can check it rather than trust it.

/**
 * Russia. Quoted as 17,098,242 (CIA/dr5hn), 17,098,246 (Wikidata) and 17,125,191
 * (Rosstat, including Crimea). The bound must clear the LARGEST of the three, not
 * whichever one was looked up first — an earlier draft was pinned to the Wikidata
 * figure exactly, leaving zero headroom and flagging Russia itself on a
 * Rosstat-sourced record.
 */
export const MAX_COUNTRY_AREA_KM2 = 17_200_000

/** Altamira, Brazil (~159,533 km2) is the largest municipality on Earth. */
export const MAX_CITY_AREA_KM2 = 200_000

/** The Dead Sea shore, the lowest dry land, is about -430 m. */
export const MIN_ELEVATION_M = -500

/** La Rinconada, Peru (~5,100 m) is the highest permanent settlement. */
export const MAX_ELEVATION_M = 5_300

/**
 * Manila, the densest city on Earth, is about 43,000 /km2. Above 50,000 the pair
 * is not a measurement of one place: it is almost always a metro-area population
 * over a city-proper area. Paris is exactly that — 12,000,000 over 105.4 km2.
 *
 * Density is only ever ADVISORY. It says the pair is wrong without saying which
 * half, so it may not gate a write or license a repair to blank a column.
 */
export const MAX_DENSITY_PER_KM2 = 50_000

export type CityScalarField = 'area_km2' | 'elevation_m' | 'population'

/**
 * Is this value physically possible for the column it is about to be written to?
 *
 * `null`/`undefined` is PLAUSIBLE — absence is not a defect, and treating it as
 * one would make every empty column a finding.
 *
 * Population has no upper bound here on purpose: "more populous than its own
 * country" is the real check and it needs the country row, which no caller of
 * this function has. It lives in `city_scalar_defects()`.
 */
export function plausibleCityScalar(field: CityScalarField, value: unknown): boolean {
  if (value == null) return true
  const n = Number(value)
  if (!Number.isFinite(n)) return false
  switch (field) {
    case 'area_km2':
      return n > 0 && n <= MAX_CITY_AREA_KM2
    case 'elevation_m':
      return n >= MIN_ELEVATION_M && n <= MAX_ELEVATION_M
    case 'population':
      return n >= 0
  }
}
