import type { ProtectionAttr, RightTopic } from './rightsCatalog';
import { readRightValue, topicScalarValue, type StatusKind } from './rightsValue';
import { parseSsuDetails, getProtectionStatus } from '@/utils/equalityScore';

/**
 * Per-country right classification — the single reader the worldwide summary
 * AND the choropleth map both call, so the two can never disagree.
 *
 * Extracted out of rightsWorldSummary.ts, which only ever needed a worldwide
 * aggregate. The map needs the answer for ONE country and ONE topic —
 * `StatusKind` itself — which is exactly the per-row step
 * `summariseRightsWorldwide` used to inline before bucketing into a count.
 *
 * `valueForTopic` lives HERE, not in rightsWorldSummary.ts, on purpose:
 * rightsWorldSummary.ts calls `classifyCountryRight` for its per-country
 * step, so the reverse import (this file reading `valueForTopic` back out of
 * rightsWorldSummary.ts) would be a cycle. rightsWorldSummary.ts re-exports
 * it under the same name for existing importers/tests.
 *
 * THREE COLUMNS NEED BESPOKE READING, unchanged from the summary's original
 * comment:
 *
 *   criminalisation → `lgbti_criminalization.legal` (boolean)
 *   marriage        → `parseSsuDetails(lgbti_same_sex_unions).marriage`
 *   civil-union     → `parseSsuDetails(lgbti_same_sex_unions).civil_union`
 *
 * PROTECTION-MATRIX rights (9 of 18) are split across so/gi/ge/sc and are NOT
 * scalars. Feeding the jsonb straight to `readRightValue` bucketed every
 * country as "no" — caught on the rendered `/rights` page, not by unit tests
 * that only fed scalars. They are read through `getProtectionStatus`, the
 * same helper `ProtectionCells` uses, and classified as:
 *
 *   yes     — every declared attribute reads Yes
 *   partial — some do
 *   no      — none do, but the country has a reading
 *   none    — no known reading at all ('No data' on every declared attribute)
 *
 * "All four" is the deliberate bar for `yes`. Counting "any attribute" would
 * let a country that protects sexual orientation but not gender identity read
 * as protecting trans people, which is precisely the erasure this product
 * exists to refuse.
 *
 * `gender-recognition` IS classified here, even though the worldwide summary
 * refuses to aggregate it (`UNCOUNTED_SLUGS` in rightsWorldSummary.ts). Those
 * are different questions: summing 250 countries into one number requires the
 * column's key layout to be established, which it is not, so a worldwide
 * count would be a guess. Reading ONE country's own value is not a guess —
 * it is the same `status` kind read that every other status topic gets. The
 * map may legitimately show a country's gender-recognition reading even
 * though the worldwide count for that topic stays hidden.
 */

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

/**
 * `readRightValue` is contracted to `string | boolean | null | undefined`.
 * Anything else (a malformed jsonb shape landing where a scalar is expected)
 * would stringify into e.g. "[object Object]" and get read by the vocab's
 * unknown-value fallback as `partial` — a confident-looking answer about
 * data that was never actually a legal-status string. Malformed input reads
 * as `none` instead, the same "we have nothing" every other absent column
 * uses.
 */
function isReadableScalar(value: unknown): value is string | boolean | null | undefined {
  return value == null || typeof value === 'string' || typeof value === 'boolean';
}

/**
 * Which people a protection question is asked about.
 *
 * ILGA records every protection-matrix column against four attributes, so the
 * SAME column answers four different questions. `'all'` is the strict default
 * the ledger uses — every declared attribute must read Yes — and a single
 * attribute narrows it to one group.
 *
 * This is what lets one map answer the question TGEU's Trans Rights Map asks:
 * `lens: 'gi'` reads employment / housing / health / hate-crime protection for
 * GENDER IDENTITY specifically, rather than reporting a country as protective
 * because it covers sexual orientation. It is our own ILGA data through a trans
 * lens — NOT TGEU's 32-indicator index, which is a different dataset over 54
 * countries and is not imported here.
 */
export type RightsLens = 'all' | ProtectionAttr;

/**
 * Classify one country's reading for one topic.
 *
 * `lens` narrows a protection-matrix topic to a single attribute; it is ignored
 * for every other kind, because those columns are not split by attribute and
 * pretending otherwise would invent a trans-specific reading where the source
 * has only one value for everyone.
 *
 * Never throws: a malformed or absent value reads as `'none'` rather than
 * propagating an exception up into a render.
 */
export function classifyCountryRight(
  country: CountryRow,
  topic: RightTopic,
  lens: RightsLens = 'all',
): StatusKind {
  try {
    if (topic.kind === 'protection-matrix') {
      const status = getProtectionStatus(country?.[topic.column] as Record<string, unknown> | null);
      const declared =
        topic.attributes.length > 0 ? topic.attributes : (['so', 'gi', 'ge', 'sc'] as const);
      // A lens naming an attribute this topic does not record is not a "no" —
      // the question was never asked of this column.
      const attrs =
        lens === 'all' ? declared : declared.includes(lens) ? ([lens] as const) : ([] as const);
      if (attrs.length === 0) return 'none';
      const readings = attrs.map((a) => status[a]);
      // 'No data' is absence, not a negative — same rule as the scalar path.
      const known = readings.filter((r) => r !== 'No data');
      if (known.length === 0) return 'none';
      const yeses = known.filter((r) => r === 'Yes').length;
      if (yeses === attrs.length) return 'yes';
      if (yeses > 0) return 'partial';
      return 'no';
    }

    const value = valueForTopic(country, topic);
    if (!isReadableScalar(value)) return 'none';
    return readRightValue(value, topic.severeNegative).kind;
  } catch {
    return 'none';
  }
}
