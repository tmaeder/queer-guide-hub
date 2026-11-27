/**
 * schema.org `Dataset` JSON-LD for the pages that publish data people cite:
 * the rights-by-country pages and the drug interaction chart.
 *
 * Measured 2026-11-18: these hub pages emitted no JSON-LD at all, so Google
 * Dataset Search and anyone vetting the page as a source saw a title and a
 * paragraph. This adds a machine-readable statement of what the data is, who
 * compiles it, and what it is built on.
 *
 * The interaction chart's sources are read from the table, not listed here.
 * The table is multi-source (TripSit, eve&rave, FDA labels, rave it safe at the
 * time of writing), and a hardcoded credit is the defect this repo already
 * shipped once: the grid footer credited TripSit alone over cells TripSit
 * never made. Sources are deduplicated by NAME, because one source (FDA label)
 * cites several documents and a URL-keyed list prints it four times.
 *
 * No `license` is declared. None has been chosen for this data yet, and an
 * invented one would be a false statement to anyone reusing it.
 */
import type { Env } from './sitemap';
import { SITE_ORIGIN } from './routeMeta';
import { renderLd } from './jsonLd';
import { trimTrailingSlashes } from '../../src/lib/trimTrailingSlashes';

const CREATOR = { '@type': 'Organization', name: 'Queer Guide', url: SITE_ORIGIN };

const ILGA = {
  '@type': 'Dataset',
  name: 'ILGA World Database',
  url: 'https://database.ilga.org/',
  creator: { '@type': 'Organization', name: 'ILGA World', url: 'https://ilga.org/' },
};

// Same URLs as TGEU_TMM_URL / TGEU_TRI_URL in src/lib/rights/transSafety.ts.
const TGEU_TMM = {
  '@type': 'Dataset',
  name: 'TGEU Trans Murder Monitoring',
  url: 'https://transmurdermonitoring.tgeu.org/',
  creator: { '@type': 'Organization', name: 'TGEU', url: 'https://tgeu.org/' },
};
const TGEU_TRI = {
  '@type': 'Dataset',
  name: 'TGEU Trans Rights Map',
  url: 'https://transrightsmap.tgeu.org/',
  creator: { '@type': 'Organization', name: 'TGEU', url: 'https://tgeu.org/' },
};

type DatasetDef = Record<string, unknown>;

// The bulk download (functions/data/rights-by-country.*). Its licence is split
// by column, so no `license` is declared here: see rightsExport.ts.
const RIGHTS_DISTRIBUTION = ['csv', 'json'].map((ext) => ({
  '@type': 'DataDownload',
  encodingFormat: ext === 'csv' ? 'text/csv' : 'application/json',
  contentUrl: `${SITE_ORIGIN}/data/rights-by-country.${ext}`,
}));

const RIGHTS_WITH_SCORE: DatasetDef = {
  name: 'LGBTQ+ rights by country, with equality score',
  description:
    'Legal status for LGBTQ+ people in every country and territory: criminalisation and penalties, partnership recognition, anti-discrimination protections, hate-crime law, adoption, gender recognition, conversion-practice bans and intersex protection, plus a 0–100 equality score computed from that record. Re-imported nightly from the ILGA World Database.',
  isBasedOn: ILGA,
  spatialCoverage: { '@type': 'Place', name: 'Worldwide' },
  measurementTechnique: `${SITE_ORIGIN}/tags/rights-by-country/methodology`,
  distribution: RIGHTS_DISTRIBUTION,
  keywords: ['LGBTQ+ rights', 'equality score', 'methodology', 'ILGA'],
};

const STATIC_DATASETS: Record<string, DatasetDef> = {
  '/tags/rights-by-country': {
    name: 'LGBTQ+ legal status by country',
    measurementTechnique: `${SITE_ORIGIN}/tags/rights-by-country/methodology`,
    distribution: RIGHTS_DISTRIBUTION,
    description:
      'The legal position of LGBTQ+ people in 250 countries and territories: criminalisation of same-sex acts and its penalty, partnership recognition, anti-discrimination protection, legal gender recognition, conversion-practice regulation, and a 0–100 equality score computed from these facts. Re-imported nightly from the ILGA World Database.',
    isBasedOn: ILGA,
    variableMeasured: [
      'Criminalisation of same-sex sexual acts',
      'Penalty for same-sex sexual acts',
      'Same-sex marriage and civil unions',
      'Anti-discrimination protection',
      'Legal gender recognition',
      'Conversion practices regulation',
      'Equality score (0–100)',
    ],
    spatialCoverage: { '@type': 'Place', name: 'Worldwide' },
    keywords: ['LGBTQ+ rights', 'criminalisation', 'same-sex marriage', 'ILGA', 'equality'],
  },
  // Same dataset, described from the pages that explain its sources and its score.
  '/tags/rights-by-country/sources': RIGHTS_WITH_SCORE,
  '/tags/rights-by-country/methodology': RIGHTS_WITH_SCORE,
  '/tags/rights-by-country/trans': {
    name: 'Trans legal gender recognition and documented anti-trans violence by country',
    description:
      'Whether each country allows a change of legal gender marker and what it requires first (surgery, diagnosis, divorce), from the ILGA World Database and the TGEU Trans Rights Map, alongside TGEU Trans Murder Monitoring counts of documented killings of trans and gender-diverse people since 2008. The counts are reported separately and never combined into a score.',
    isBasedOn: [ILGA, TGEU_TRI, TGEU_TMM],
    variableMeasured: [
      'Legal gender recognition',
      'Requirements for legal gender recognition',
      'Documented killings of trans and gender-diverse people',
    ],
    spatialCoverage: { '@type': 'Place', name: 'Worldwide' },
    keywords: ['trans rights', 'legal gender recognition', 'TGEU', 'ILGA'],
  },
};

const INTERACTIONS_PATH = '/tags/interactions';

const INTERACTIONS: DatasetDef = {
  name: 'Drug combination risks',
  description:
    'Risk ratings for combining psychoactive substances and medications, one rating per pair, including substances common in queer nightlife and chemsex. Each pair is credited to the harm-reduction or regulatory source that assessed it.',
  variableMeasured: ['Combination risk rating'],
  keywords: ['harm reduction', 'drug interactions', 'chemsex', 'polydrug use'],
};

type SourceRow = { source: string | null; source_url: string | null; fetched_at: string | null };
type SourceSummary = {
  sources: { name: string; url: string | null }[];
  dateModified: string | null;
};

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; value: SourceSummary } | null = null;

/** Reduce the per-pair rows to one entry per source name plus the newest fetch. */
export function summariseSources(rows: SourceRow[]): SourceSummary {
  const byName = new Map<string, string | null>();
  let latest: string | null = null;
  for (const r of rows) {
    const name = r.source?.trim();
    if (name && !byName.has(name)) byName.set(name, r.source_url ?? null);
    if (r.fetched_at && (!latest || r.fetched_at > latest)) latest = r.fetched_at;
  }
  return {
    sources: [...byName]
      .map(([name, url]) => ({ name, url }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    dateModified: latest,
  };
}

async function interactionSources(env: Env): Promise<SourceSummary | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const key = env.SUPABASE_ANON_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) return null;
  try {
    // Keep one bounded read. Exact range/count verification prevents crediting
    // only a prefix of the table if it grows beyond the API's row limit.
    const url = `${trimTrailingSlashes(env.SUPABASE_URL)}/rest/v1/substance_interactions?select=source,source_url,fetched_at&limit=1000`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        Prefer: 'count=exact',
      },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as SourceRow[];
    const range = res.headers.get('Content-Range')?.match(/^0-(\d+)\/(\d+)$/);
    if (
      !Array.isArray(rows) ||
      !range ||
      Number(range[1]) + 1 !== rows.length ||
      Number(range[2]) !== rows.length
    )
      return null;
    const value = summariseSources(rows);
    if (value.sources.length === 0) return null;
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return null;
  }
}

function dataset(path: string, def: DatasetDef): string {
  return renderLd({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    url: `${SITE_ORIGIN}${path}`,
    creator: CREATOR,
    isAccessibleForFree: true,
    ...def,
  });
}

/**
 * `<script type="application/ld+json">` Dataset for `basePath`, or '' for any
 * other path. For the interaction chart it returns '' when the sources cannot
 * be read: a Dataset that credits nobody is worse than none.
 */
export async function datasetJsonLd(env: Env, basePath: string): Promise<string> {
  const path = basePath.replace(/\/+$/, '') || '/';
  const def = STATIC_DATASETS[path];
  if (def) return dataset(path, def);
  if (path !== INTERACTIONS_PATH) return '';
  const summary = await interactionSources(env);
  if (!summary) return '';
  return dataset(path, {
    ...INTERACTIONS,
    ...(summary.dateModified ? { dateModified: summary.dateModified } : {}),
    isBasedOn: summary.sources.map((s) => ({
      '@type': 'CreativeWork',
      name: s.name,
      ...(s.url ? { url: s.url } : {}),
    })),
  });
}

/** Test hook: drop the isolate cache. */
export function _resetDatasetCache(): void {
  cache = null;
}
