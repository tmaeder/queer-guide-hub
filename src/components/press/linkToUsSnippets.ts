export const ORIGIN = 'https://queer.guide';

/** Versioned: /*.svg is cached immutable, so a new badge needs a new name. */
export const BADGE_PATH = '/images/badge/queer-guide-data-v1.svg';

/**
 * The pages other sites cite. The anchor text is English on purpose: it is
 * pasted into someone else's page, and they can reword it.
 */
export const LINKABLE_PAGES = [
  { id: 'rights', path: '/tags/rights-by-country', text: 'LGBTQ+ rights by country (Queer Guide)' },
  {
    id: 'methodology',
    path: '/tags/rights-by-country/methodology',
    text: 'How the Queer Guide equality score is calculated',
  },
  { id: 'help', path: '/help', text: 'LGBTQ+ crisis lines by country (Queer Guide)' },
  { id: 'interactions', path: '/tags/interactions', text: 'Drug combination risks (Queer Guide)' },
] as const;

export const BADGE_SNIPPET = `<a href="${ORIGIN}/tags/rights-by-country"><img src="${ORIGIN}${BADGE_PATH}" alt="LGBTQ+ data from queer.guide" width="200" height="56"></a>`;

export const LISTING_SNIPPET = `<a href="${ORIGIN}/organizations/YOUR-LISTING">Listed on Queer Guide</a>`;
