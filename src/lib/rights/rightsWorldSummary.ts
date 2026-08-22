import { RIGHT_TOPICS, type RightTopic } from './rightsCatalog';
import { classifyCountryRight } from './rightsClassify';
import type { StatusKind } from './rightsValue';

/** Re-exported for existing importers — the reader itself now lives in
 * rightsClassify.ts (see that file's header for why). */
export { valueForTopic } from './rightsClassify';

/**
 * Worldwide counts per right — the "rights in general" view.
 *
 * `/rights` shipped as a country index: pick a country, read its ledger. The 18
 * rights already exist as data at 100% coverage (see rightsCatalog), but the
 * page rendered exactly one of them. This turns the axis around — for each
 * right, how much of the world has it — without inventing a new data source.
 *
 * The per-country read (the three bespoke columns, the protection-matrix
 * "all four" bar, malformed-value handling) lives in `classifyCountryRight`
 * (rightsClassify.ts) now — this file only buckets that per-country
 * `StatusKind` into a worldwide count. That split is what keeps this summary
 * and the choropleth map from ever disagreeing about what one country's value
 * means.
 *
 * `gender-recognition` is DELIBERATELY NOT COUNTED here. Its column is an
 * object whose key layout is not established here, and a guess would produce
 * a confident wrong number about trans legal recognition specifically. It
 * still renders in the list, without a count, rather than being hidden — an
 * omitted right reads as "this does not exist"; an uncounted one reads as
 * what it is. `classifyCountryRight` still classifies it per-country (see
 * that file's header for why a per-country reading is not the same guess).
 */

export const UNCOUNTED_SLUGS: ReadonlySet<string> = new Set(['gender-recognition']);

export interface RightWorldSummary {
  topic: RightTopic;
  /** Countries whose value reads as an affirmative protection. */
  yes: number;
  /** Countries whose value reads as negative, including criminal exposure. */
  no: number;
  /** Partial / qualified protections. */
  partial: number;
  /** Countries with a reading at all (yes + no + partial). */
  measured: number;
  /** True when this right is not aggregatable — render it without a number. */
  uncounted: boolean;
}

type CountryRow = Record<string, unknown>;

function bucket(kind: StatusKind): 'yes' | 'no' | 'partial' | null {
  if (kind === 'yes') return 'yes';
  if (kind === 'no' || kind === 'severe') return 'no';
  if (kind === 'partial') return 'partial';
  return null; // 'none' — no reading, not a zero
}

export function summariseRightsWorldwide(countries: CountryRow[]): RightWorldSummary[] {
  return RIGHT_TOPICS.map((topic) => {
    if (UNCOUNTED_SLUGS.has(topic.slug)) {
      return { topic, yes: 0, no: 0, partial: 0, measured: 0, uncounted: true };
    }

    let yes = 0;
    let no = 0;
    let partial = 0;

    for (const country of countries) {
      const kind = classifyCountryRight(country, topic);
      const b = bucket(kind);
      if (b === 'yes') yes += 1;
      else if (b === 'no') no += 1;
      else if (b === 'partial') partial += 1;
    }

    return { topic, yes, no, partial, measured: yes + no + partial, uncounted: false };
  });
}
