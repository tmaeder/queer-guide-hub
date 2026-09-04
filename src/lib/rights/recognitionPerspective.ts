import { readMarker, requiresIt, isAffirmed } from './transSafety';
import type { TransRightsCountry } from '@/hooks/useIntentData';

/**
 * Legal gender recognition, counted in PEOPLE as well as in countries.
 *
 * The page this feeds exists because those two counts disagree, sharply and in
 * both directions. Measured on production 2026-09-01, over all 250 countries
 * and 8,218,889,254 people:
 *
 *   requires surgery        15 countries  ( 6%)  ·  3.39bn people  (41%)
 *   self-determination      22 countries  ( 9%)  ·  528m people    (6.4%)
 *
 * A country count treats Nauru and India as one unit each. The law is written
 * about people, so a "share of the world" claim on this page is a share of
 * humanity, and the sterilisation figure is understated roughly sevenfold by
 * the conventional framing.
 *
 * TWO RULES HOLD THROUGHOUT AND ARE TESTED:
 *
 *   1. The regimes PARTITION the world. Every country lands in exactly one
 *      bucket and the buckets sum to 250 / 8,218,889,254. "No record" is a
 *      visible bucket, never an excluded denominator — a 100% band that
 *      quietly drops its unknowns is a 100% band that lies.
 *   2. Population is applied to LAW ONLY. It is never applied to the TGEU
 *      documented-violence counts. Those track reporting capacity, not danger
 *      (countries with documented cases average equality_score 66.2; those
 *      with none average 48.9), so a per-capita rate would rank Honduras and
 *      Brazil as the most dangerous places on earth and Iran as among the
 *      safest. See src/lib/rights/transSafety.ts.
 */

export type RegimeId =
  | 'self-determination'
  | 'gatekept'
  | 'nominal'
  | 'surgery'
  | 'unclear'
  | 'impossible'
  | 'no-record';

export interface RegimeDef {
  id: RegimeId;
  /** i18n suffix: rights.trans.regime.<key>.label / .note */
  key: string;
  /**
   * Ink weight 0..1. Declared, never derived from array index.
   *
   * SEVERITY-ASCENDING, matching `MAP_CLASS_INK` on /rights, where the ramp
   * runs protected 0.12 → death 0.9. The two rights maps have to mean the same
   * thing by "darker": a reader who learns "heavier ink is worse" on /rights
   * and then meets a map here where the heaviest ink was self-determination
   * would read this one exactly backwards. It also puts the visual weight
   * where the page's subject is — the places that deny recognition or charge
   * sterilisation for it draw the eye, not the places that do neither.
   *
   * `impossible` outranks `surgery` because a sterilisation requirement still
   * leaves a route, however brutal, and no route at all is the worse outcome.
   * That ordering is the ladder `RECOGNITION_REGIMES` already declares; the
   * ramp is monotonic along it rather than an editorial re-ranking.
   */
  weight: number;
  /**
   * `hatch` marks a bucket where the source gives no usable answer. A SHAPE
   * cue, because seven steps of one ink is past what tone alone resolves and
   * "we don't know" must not read as a rung on the ladder (WCAG 1.4.1).
   */
  texture: 'solid' | 'hatch';
}

/**
 * Ladder order: most recognition to least, with the two unknowns last — off
 * the continuum on purpose, the same way `MAP_CLASS_ORDER` keeps `nodata`
 * last. A gap in the source is not a point between "possible" and
 * "impossible", and ordering it there would give an unmeasured country a
 * severity reading it has not earned.
 */
export const RECOGNITION_REGIMES: readonly RegimeDef[] = [
  { id: 'self-determination', key: 'selfDetermination', weight: 0.12, texture: 'solid' },
  { id: 'gatekept', key: 'gatekept', weight: 0.34, texture: 'solid' },
  { id: 'nominal', key: 'nominal', weight: 0.48, texture: 'solid' },
  { id: 'surgery', key: 'surgery', weight: 0.72, texture: 'solid' },
  { id: 'impossible', key: 'impossible', weight: 0.9, texture: 'solid' },
  { id: 'unclear', key: 'unclear', weight: 0.16, texture: 'hatch' },
  { id: 'no-record', key: 'noRecord', weight: 0.1, texture: 'hatch' },
];

/**
 * Ordered, first-match. THE ORDER IS THE ARGUMENT, not an implementation
 * detail, and two steps in it are load-bearing:
 *
 *   · `surgery` is tested BEFORE `nominal`. Vietnam is both "Nominally
 *     Possible" and "Required"; filing it under "on paper only" would hide a
 *     sterilisation requirement behind the softer of the two facts.
 *   · `unclear` is tested BEFORE `surgery`, so a country whose marker rule we
 *     cannot read is never assigned a requirement we cannot evidence.
 */
export function regimeOf(row: Record<string, unknown>): RegimeId {
  const lgr = (row.lgbti_gender_recognition ?? {}) as Record<string, unknown>;
  const marker = readMarker(lgr.gender_marker);

  if (marker === 'unrecorded') return 'no-record';
  if (marker === 'not_possible') return 'impossible';
  if (marker === 'indeterminate') return 'unclear';
  if (requiresIt(lgr.requires_surgery)) return 'surgery';
  if (marker === 'nominally_possible') return 'nominal';
  // A bare "Yes" only. Nepal's "Yes (for NB marker only)" is a real provision
  // but not general self-determination, so it lands in `gatekept`.
  if (isAffirmed(lgr.self_id)) return 'self-determination';
  return 'gatekept';
}

export interface RegimeExample {
  id: string;
  name: string;
  slug: string | null;
  population: number;
}

export interface RegimeBucket {
  regime: RegimeDef;
  countries: number;
  people: number;
  /** Largest population first — the readout and the surgery strip both use it. */
  examples: RegimeExample[];
}

export interface RecognitionWorld {
  /** Always 7, in RECOGNITION_REGIMES order, including empty buckets. */
  buckets: RegimeBucket[];
  totalCountries: number;
  totalPeople: number;
}

/** Missing population counts as 0 people, never as a dropped country. */
function popOf(row: Record<string, unknown>): number {
  const n = Number(row.population ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function summariseRecognitionWorld(rows: readonly TransRightsCountry[]): RecognitionWorld {
  const byId = new Map<RegimeId, RegimeBucket>(
    RECOGNITION_REGIMES.map((regime) => [
      regime.id,
      { regime, countries: 0, people: 0, examples: [] },
    ]),
  );

  let totalPeople = 0;
  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    const pop = popOf(record);
    totalPeople += pop;

    const bucket = byId.get(regimeOf(record))!;
    bucket.countries += 1;
    bucket.people += pop;
    bucket.examples.push({
      id: row.id,
      name: row.name,
      slug: row.slug ?? null,
      population: pop,
    });
  }

  for (const bucket of byId.values()) {
    bucket.examples.sort((a, b) => b.population - a.population);
  }

  return {
    buckets: RECOGNITION_REGIMES.map((r) => byId.get(r.id)!),
    totalCountries: rows.length,
    totalPeople,
  };
}

// ---------------------------------------------------------------------------
// Development is a counter-example here, never an explanation
// ---------------------------------------------------------------------------

export interface DevelopmentRow extends RegimeExample {
  hdi: number | null;
  gdpPerCapita: number | null;
  equalityScore: number | null;
}

/**
 * Recognition DOES correlate with development, and that is the reason to show
 * the exceptions rather than the correlation: a scatter of HDI against rights
 * draws a ramp and invites the reader to conclude that countries grow into
 * recognition. Five of the richest countries on earth demand sterilisation.
 *
 * Threshold 0.8 is the UNDP "very high human development" line, not a number
 * picked to make the list come out at five.
 */
export const HIGH_HDI = 0.8;

export function developmentCounterexamples(rows: readonly TransRightsCountry[]): {
  highHdiRequiresSurgery: DevelopmentRow[];
  lowHdiHasSelfId: DevelopmentRow[];
} {
  const shape = (row: TransRightsCountry): DevelopmentRow => ({
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    population: popOf(row as unknown as Record<string, unknown>),
    hdi: row.human_development_index ?? null,
    gdpPerCapita: row.gdp_per_capita_usd ?? null,
    equalityScore: row.equality_score ?? null,
  });

  const hdiOf = (row: TransRightsCountry) => row.human_development_index ?? null;

  return {
    highHdiRequiresSurgery: rows
      .filter((r) => (hdiOf(r) ?? 0) >= HIGH_HDI)
      .filter((r) => requiresIt((r.lgbti_gender_recognition ?? {}).requires_surgery))
      .map(shape)
      .sort((a, b) => (b.hdi ?? 0) - (a.hdi ?? 0)),
    lowHdiHasSelfId: rows
      .filter((r) => hdiOf(r) != null && (hdiOf(r) as number) < HIGH_HDI)
      .filter((r) => isAffirmed((r.lgbti_gender_recognition ?? {}).self_id))
      .map(shape)
      .sort((a, b) => (b.hdi ?? 0) - (a.hdi ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// When self-determination arrived
// ---------------------------------------------------------------------------

export interface TimelineYear {
  year: number;
  countries: string[];
  /** Countries with self-ID in force by the end of this year. */
  cumulative: number;
}

/**
 * When self-determination arrived, cumulatively.
 *
 * A SHAPE, not a census, and the caption has to say so twice over:
 *
 *  · `self_id_since` is recorded for 20 of the 22 self-ID countries. Greenland
 *    and the Northern Mariana Islands have the right and no recorded year, so
 *    the line understates the total by two and always will.
 *  · A start year says nothing about whether the right survived. Greece is the
 *    proof inside our own data: it carries `self_id_since: 2017` and
 *    `self_id: 'No'`. Because the filter below tests `isAffirmed` BEFORE
 *    reading the year, Greece is correctly absent — a country that no longer
 *    qualifies must not appear on a chart of countries that do. Reverse those
 *    two checks and the line silently gains a country that lost the right.
 *
 * TGEU's own Trans Rights Index moved BACKWARDS in 2026 for the first time in
 * thirteen years, which is the same lesson at index scale.
 */
export function selfIdTimeline(rows: readonly TransRightsCountry[]): TimelineYear[] {
  const byYear = new Map<number, string[]>();

  for (const row of rows) {
    const lgr = (row.lgbti_gender_recognition ?? {}) as Record<string, unknown>;
    if (!isAffirmed(lgr.self_id)) continue;
    const year = Number(lgr.self_id_since ?? NaN);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) continue;
    byYear.set(year, [...(byYear.get(year) ?? []), row.name]);
  }

  let cumulative = 0;
  return [...byYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => {
      const countries = [...byYear.get(year)!].sort((a, b) => a.localeCompare(b));
      cumulative += countries.length;
      return { year, countries, cumulative };
    });
}
