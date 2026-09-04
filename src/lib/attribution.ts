/**
 * The sources whose licence *requires* a credit, as opposed to the ones the
 * colophon names out of courtesy.
 *
 * This exists because the `/about` colophon is now behind a login. That is a
 * product decision and a legitimate one, but attribution is not a product
 * decision — ODbL and the CC BY family ask for the credit to reach the reader
 * of the work, and an anonymous reader is still a reader. So the obligated
 * subset lives here and is rendered by the footer on every page, signed in or
 * out, while `/about` keeps the fuller story for members.
 *
 * ENTRY CRITERION is the licence, not the row count. Present:
 *   - OpenStreetMap ........ ODbL. Not optional: the city-card network
 *                            diagrams are a derived work of OSM route
 *                            relations, so the site publishes OSM-derived
 *                            artwork on its own homepage.
 *   - Wikidata/Wikipedia ... CC BY-SA (the CC0 half carries no condition, the
 *                            BY-SA half does).
 *   - GeoNames ............. CC BY 4.0
 *   - World Bank ........... CC BY 4.0
 *   - dr5hn + mledoze ...... ODbL 1.0
 *
 * DELIBERATELY ABSENT, so they are not "completed" back in:
 *   - CIA World Factbook and OurAirports are public domain. There is no
 *     condition to satisfy, and padding a legal notice with credits that are
 *     not legally required makes it harder to see which ones are.
 *   - ILGA World is a courtesy credit — the colophon owes it, this list does
 *     not. It is cited inline on the rights pages where its data appears.
 *
 * `licence` is what the upstream project publishes under. It is not a claim
 * about this site's own licence, and every string here was read from the
 * publisher's own page rather than inferred.
 *
 * The names and hrefs are intentionally NOT translated: they are proper nouns
 * and licence identifiers. "ODbL" is the same token in every locale, and a
 * translated one would stop being the identifier the licence names.
 *
 * `src/pages/__tests__/About.test.tsx` asserts the colophon still covers every
 * entry below, so the two surfaces cannot drift into disagreeing about who is
 * owed a credit.
 */
export interface AttributionSource {
  name: string;
  href: string;
  licence: string;
}

export const REQUIRED_ATTRIBUTION: readonly AttributionSource[] = [
  {
    name: 'OpenStreetMap',
    href: 'https://www.openstreetmap.org/copyright',
    licence: 'ODbL',
  },
  {
    name: 'Wikidata',
    href: 'https://www.wikidata.org/',
    licence: 'CC BY-SA',
  },
  {
    name: 'GeoNames',
    href: 'https://www.geonames.org/',
    licence: 'CC BY 4.0',
  },
  {
    name: 'World Bank Open Data',
    href: 'https://data.worldbank.org/',
    licence: 'CC BY 4.0',
  },
  {
    name: 'Countries States Cities Database',
    href: 'https://github.com/dr5hn/countries-states-cities-database',
    licence: 'ODbL 1.0',
  },
  {
    name: 'mledoze/countries',
    href: 'https://github.com/mledoze/countries',
    licence: 'ODbL 1.0',
  },
] as const;
