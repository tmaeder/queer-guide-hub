/** Canonical URL other sites should cite for the rights data and its method. */
export const RIGHTS_SOURCES_URL = 'https://queer.guide/tags/rights-by-country/sources';

/**
 * One citation string, shared by the page's "Cite this data" block and the
 * crawler HTML so both say the same thing. `accessed` is the reader's date.
 */
export function buildRightsCitation(accessed: Date): string {
  const date = accessed.toISOString().slice(0, 10);
  return `Queer Guide. "LGBTQ+ rights by country: sources and equality score methodology." Based on the ILGA World Database. ${RIGHTS_SOURCES_URL} (accessed ${date}).`;
}
