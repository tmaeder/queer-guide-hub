import { RIGHT_TOPICS, type RightTopic } from './rightsCatalog';
import { readRightValue, topicScalarValue, type StatusKind } from './rightsValue';
import { parseSsuDetails, getProtectionStatus } from '@/utils/equalityScore';

/**
 * Worldwide counts per right — the "rights in general" view.
 *
 * `/rights` shipped as a country index: pick a country, read its ledger. The 18
 * rights already exist as data at 100% coverage (see rightsCatalog), but the
 * page rendered exactly one of them. This turns the axis around — for each
 * right, how much of the world has it — without inventing a new data source.
 *
 * THREE COLUMNS NEED BESPOKE READING and are handled explicitly. Feeding a
 * jsonb object straight to readRightValue does not throw; it returns `none`,
 * which would silently under-report a legal protection. On this page that is
 * the expensive direction to be wrong in, so each is unpacked the same way the
 * country card unpacks it:
 *
 *   criminalisation → `lgbti_criminalization.legal` (boolean)
 *   marriage        → `parseSsuDetails(lgbti_same_sex_unions).marriage`
 *   civil-union     → `parseSsuDetails(lgbti_same_sex_unions).civil_union`
 *
 * PROTECTION-MATRIX rights (9 of the 18) are split across so/gi/ge/sc and are
 * NOT scalars. Passing the jsonb straight to readRightValue bucketed all 250
 * countries as "no" and rendered "0 of 250 countries protect" for employment,
 * housing, health and six more — caught on the rendered page, not by the unit
 * tests, which only fed scalars. They are now read through
 * getProtectionStatus, the same helper ProtectionCells uses, and counted as:
 *
 *   yes     — every declared attribute reads Yes  ("fully protect")
 *   partial — some do
 *   no      — none do, but the country has a reading
 *
 * "All four" is the deliberate bar for `yes`. Counting "any attribute" would
 * let a country that protects sexual orientation but not gender identity count
 * as protecting trans people, which is precisely the erasure this product
 * exists to refuse. The page labels these rows "fully protect" so the stricter
 * bar is visible rather than implied.
 *
 * `gender-recognition` is DELIBERATELY NOT COUNTED. Its column is an object
 * whose key layout is not established here, and a guess would produce a
 * confident wrong number about trans legal recognition specifically. It still
 * renders in the list, without a count, rather than being hidden — an omitted
 * right reads as "this does not exist"; an uncounted one reads as what it is.
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

/** The scalar to interpret for a topic, including the three bespoke columns. */
export function valueForTopic(country: CountryRow, topic: RightTopic): unknown {
  if (topic.slug === 'criminalisation') {
    const crim = country.lgbti_criminalization as Record<string, unknown> | null;
    // `legal: false` is criminalised. Absent/unknown must stay unmeasured
    // rather than defaulting either way.
    return typeof crim?.legal === 'boolean' ? crim.legal : null;
  }
  if (topic.slug === 'marriage' || topic.slug === 'civil-union') {
    const details = parseSsuDetails(country.lgbti_same_sex_unions as string | null);
    return topic.slug === 'marriage' ? details.marriage : details.civil_union;
  }
  return topicScalarValue(country, topic);
}

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

    if (topic.kind === 'protection-matrix') {
      for (const country of countries) {
        const status = getProtectionStatus(
          country[topic.column] as Record<string, unknown> | null,
        );
        const attrs = topic.attributes.length > 0 ? topic.attributes : (['so', 'gi', 'ge', 'sc'] as const);
        const readings = attrs.map((a) => status[a]);
        // 'No data' is absence, not a negative — same rule as the scalar path.
        const known = readings.filter((r) => r !== 'No data');
        if (known.length === 0) continue;
        const yeses = known.filter((r) => r === 'Yes').length;
        if (yeses === attrs.length) yes += 1;
        else if (yeses > 0) partial += 1;
        else no += 1;
      }
      return { topic, yes, no, partial, measured: yes + no + partial, uncounted: false };
    }

    for (const country of countries) {
      const value = valueForTopic(country, topic);
      const { kind } = readRightValue(
        value as string | boolean | null | undefined,
        topic.severeNegative,
      );
      const b = bucket(kind);
      if (b === 'yes') yes += 1;
      else if (b === 'no') no += 1;
      else if (b === 'partial') partial += 1;
    }

    return { topic, yes, no, partial, measured: yes + no + partial, uncounted: false };
  });
}
