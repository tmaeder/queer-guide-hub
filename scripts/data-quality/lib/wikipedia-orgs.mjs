// wikipedia-orgs.mjs — pure transforms for the Wikipedia LGBTQ advocacy import.
//
// Kept separate from import-wikipedia-lgbtq-orgs.mjs (which needs a Supabase
// token and writes to prod) so the decisions that matter — what is excluded,
// what "country" means, when a name match may auto-merge — are unit-testable
// without a database. See src/lib/__tests__/wikipediaOrgs.test.ts.
//
// Design: docs/plans/2026-09-08-lgbtq-advocacy-org-import-design.md

/**
 * Hand-read exclusions, reason per row.
 *
 * NOT derived from P31. 32 of the 421 entities carry no P31 claim at all —
 * `OutNebraska`, `Janus Society`, `Human Dignity Trust` among them, every one a
 * real organization. A P31 allowlist would drop them: absence of a class claim
 * is not evidence of not being an organization.
 *
 * Category membership is likewise not a filter. `Category:LGBTQ political
 * organizations` is not a safety-reviewed vocabulary — it contains a hacktivist
 * crew and a biography.
 */
export const EXCLUSIONS = new Map([
  // Not a single organization — Wikimedia list articles (P31 = Q13406463).
  ['List of LGBT political parties', 'list article, not an organization'],
  ['List of LGBTQ rights organisations in Belize', 'list article, not an organization'],
  ['List of advocacy groups in Canada', 'list article, not an organization'],
  ['List of LGBTQ rights organizations in the United States', 'list article, not an organization'],

  // Not organizations at all.
  ['Rick Zbur', 'P31 = human; a biography misfiled under Equality Federation'],
  ['Gay and Lesbian Kingdom of the Coral Sea Islands', 'P31 = micronation, a place not a body'],
  ['ILGA consultative status controversy', 'an event, not an organization'],
  ['PaykanArtCar', 'an art car'],

  // Time-boxed campaigns rather than standing organizations.
  ['Yes Equality campaign', 'P31 = election campaign; ended 2015, not a standing body'],
  ['OneLove', 'P31 = campaign, not a standing body'],

  // Out of scope for a queer travel/community directory.
  ['SiegedSec', 'P31 = criminal organization; a hacktivist crew, not an advocacy group'],

  // General political parties that entered the tree only via their LGBT wings.
  // The wings themselves are kept — they are real standing organizations.
  ['Green Party Korea', 'a general political party, not a queer organization'],
  ['Socialist Alternative (Russia)', 'a general political international, not a queer organization'],
  ['Russian Socialist Movement', 'a general political party, not a queer organization'],
]);

/**
 * US states, DC and UK constituent countries that the category pattern
 * `LGBTQ political advocacy groups in X` yields as if they were countries.
 *
 * This is the single largest source of noise in the corpus: of 82 category-vs-P17
 * country disagreements, 79 are this artifact. Resolving before comparing is what
 * lets the remaining 3 be real signals instead of being buried.
 */
const SUBNATIONAL = new Map([
  ...[
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'Florida',
    'Georgia (U.S. state)',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York (state)',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington (state)',
    'Washington, D.C.',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
  ].map((s) => [s, 'United States']),
  ...['Scotland', 'Wales', 'England', 'Northern Ireland'].map((s) => [s, 'United Kingdom']),
]);

/** Category names carry the definite article; `countries.name` does not. */
const ARTICLE_FORMS = new Map([
  ['the United States', 'United States'],
  ['the United Kingdom', 'United Kingdom'],
  ['the Netherlands', 'Netherlands'],
  ['the Bahamas', 'Bahamas'],
  ['the Republic of Ireland', 'Ireland'],
  ['the Czech Republic', 'Czechia'],
  ['the Philippines', 'Philippines'],
]);

/**
 * A category-derived place name -> the country it belongs to.
 * Returns null for anything unrecognised rather than guessing.
 */
export function resolveCategoryCountry(raw) {
  if (!raw) return null;
  const name = raw.trim();
  if (SUBNATIONAL.has(name)) return SUBNATIONAL.get(name);
  if (ARTICLE_FORMS.has(name)) return ARTICLE_FORMS.get(name);
  // A leading article on a form not listed above.
  return name.replace(/^the\s+/i, '');
}

/**
 * Comparison key for two country names that may differ only in article or case.
 *
 * Wikipedia categories say "the Bahamas" and Wikidata's label is "The Bahamas";
 * comparing the raw strings reported `Rainbow Alliance of The Bahamas` as a
 * country conflict and would have refused a legitimate merge. The article is a
 * feature of the two sources' house style, never of the country.
 */
export function countryKey(value) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^the\s+/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * The country a record should be filed under, plus whether the two available
 * signals contradict each other.
 *
 * Category path is primary and Wikidata P17 corroborates, because P17 is
 * demonstrably wrong on this corpus: `Parliamentary League for Considering LGBT
 * Issues` is a Japanese Diet caucus carrying P17 = United States. A disagreement
 * is therefore reported, never silently resolved in P17's favour.
 *
 * Multi-country records (the Scientific-Humanitarian Committee spans Austria,
 * Germany and the Netherlands) resolve to no single country rather than picking
 * one arbitrarily.
 */
function dedupeByCountryKey(values) {
  const seen = new Map();
  for (const v of values) if (!seen.has(countryKey(v))) seen.set(countryKey(v), v);
  return [...seen.values()];
}

export function decideCountry(record) {
  const fromCategory = dedupeByCountryKey(
    (record.categoryCountries ?? []).map(resolveCategoryCountry).filter(Boolean),
  );
  const fromP17 = dedupeByCountryKey(record.p17Labels ?? []);

  if (fromCategory.length > 1) {
    return { country: null, status: 'multi_country', category: fromCategory, p17: fromP17 };
  }
  const category = fromCategory[0] ?? null;

  if (!category) {
    // No category country. A single unambiguous P17 is acceptable on its own —
    // it is uncorroborated, which the status records so the caller can decide.
    if (fromP17.length === 1) {
      return { country: fromP17[0], status: 'p17_only', category: null, p17: fromP17 };
    }
    return { country: null, status: 'unresolved', category: null, p17: fromP17 };
  }

  if (fromP17.length === 0) {
    return { country: category, status: 'category_only', category, p17: [] };
  }
  if (fromP17.some((c) => countryKey(c) === countryKey(category))) {
    return { country: category, status: 'corroborated', category, p17: fromP17 };
  }
  // Real contradiction. Keep the category answer (it is the better signal here)
  // but mark it so the caller can refuse to auto-merge on it.
  return { country: category, status: 'conflict', category, p17: fromP17 };
}

/**
 * Defunct is the UNION of two barely-overlapping signals.
 *
 * Measured on this corpus: 28 records sit in a Defunct category, 25 carry a
 * Wikidata P576 dissolved date, and only 5 carry both — 48 in total. Reading
 * either signal alone marks roughly half the dead organizations as live.
 * `dissolved_at` is the date when there is one; `is_defunct` is the fact.
 */
export function decideLifespan(record) {
  const inDefunctCategory = (record.paths ?? []).some((p) => /Defunct/i.test(p));
  const dissolvedAt = wikidataDate(record.p576?.[0]);
  const foundedAt = wikidataDate(record.p571?.[0]);
  return {
    foundedAt,
    dissolvedAt,
    isDefunct: inDefunctCategory || Boolean(dissolvedAt),
    defunctSource:
      inDefunctCategory && dissolvedAt
        ? 'both'
        : inDefunctCategory
          ? 'category'
          : dissolvedAt
            ? 'p576'
            : null,
  };
}

/**
 * Wikidata time value -> ISO date, or null.
 *
 * `+1973-00-00T00:00:00Z` is a year-precision value: month and day are literal
 * zeros, not January 1st. Coercing it to `1973-01-01` invents a precision the
 * source does not have, so a zero month or day becomes 01 only for storage and
 * only the year is ever displayed (see lifespanYear in Organizations.tsx).
 * A value outside a plausible organizational range is rejected rather than
 * stored — Wikidata carries a few placeholder dates.
 */
export function wikidataDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^([+-])(\d{4})-(\d{2})-(\d{2})T/);
  if (!m) return null;
  const [, sign, year, month, day] = m;
  if (sign === '-') return null; // BCE; not an organization we hold
  const y = Number(year);
  if (y < 1700 || y > new Date().getUTCFullYear() + 1) return null;
  const mm = month === '00' ? '01' : month;
  const dd = day === '00' ? '01' : day;
  return `${year}-${mm}-${dd}`;
}

/** Normalized key for name comparison: unaccented, alphanumerics only. */
export function nameKey(value) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * May a name-only match auto-merge into an existing organization?
 *
 * Country is the guard, and per `decideCountry` the country signal is itself
 * unreliable for a quarter of this corpus — so "no country" and "countries
 * disagree" both REFUSE rather than merge. A refused pair is printed for a human
 * instead of being written, because a wrong merge corrupts an existing row
 * (most of them ILGA-sourced) and this repo has been bitten by name-only
 * matching more than once.
 */
export function mayAutoMerge({ wikiCountry, wikiCountryStatus, dbCountry }) {
  if (!wikiCountry) return { ok: false, reason: 'no country resolved for the Wikipedia record' };
  if (!dbCountry) return { ok: false, reason: 'existing organization has no country' };
  if (wikiCountryStatus === 'conflict') {
    return { ok: false, reason: 'category and Wikidata disagree on the country' };
  }
  if (wikiCountryStatus === 'multi_country') {
    return { ok: false, reason: 'organization spans several countries' };
  }
  if (countryKey(wikiCountry) !== countryKey(dbCountry)) {
    return { ok: false, reason: `country mismatch: ${wikiCountry} vs ${dbCountry}` };
  }
  return { ok: true, reason: null };
}

/**
 * Collapse the crawl output into one record per entity.
 *
 * Keyed on QID, never on title: `categorymembers` returns redirect pages
 * carrying their own category tags, indistinguishable from articles without a
 * second lookup. 425 titles collapse to 421 entities — `Act Up-Paris` and
 * `ACT UP` are one organization, as are `Kentucky Fairness Alliance` and
 * `Fairness Campaign`. A title-keyed import creates four duplicate rows.
 *
 * The display name comes from the Wikidata label, which is the canonical form
 * and drops article disambiguators (`Stonewall (charity)` -> `Stonewall`).
 */
export function collapseRecords(records) {
  const byKey = new Map();
  for (const r of records) {
    if (EXCLUSIONS.has(r.title)) continue;
    // The one record with no QID keeps its title as its key rather than being
    // dropped; it is a real organization (a Houston political club).
    const key = r.qid || `title:${r.title}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r, titles: [r.title] });
      continue;
    }
    existing.titles.push(r.title);
    // Union the category evidence across the redirect and its target — the
    // redirect page often carries category tags the target does not.
    existing.paths = [...new Set([...existing.paths, ...r.paths])];
    existing.categoryCountries = [
      ...new Set([...existing.categoryCountries, ...r.categoryCountries]),
    ];
  }
  return [...byKey.values()].map((r) => ({
    ...r,
    name: r.wikidataLabel || r.title,
  }));
}
