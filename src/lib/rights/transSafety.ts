import { RIGHT_TOPICS } from './rightsCatalog';
import {
  isAffirmed,
  markerChangePossible,
  requiresIt,
} from '../../../supabase/functions/_shared/rights/ilgaVocabulary.ts';

/**
 * Re-exported so frontend callers have one import site for the vocabulary and
 * cannot grow a fourth private `isYes`. The reader itself lives beside
 * verdict.ts because the Deno importer needs it too — see that file's header.
 */
export {
  isAffirmed,
  markerChangePossible,
  readAffirmation,
  readMarker,
  readRequirement,
  requiresIt,
} from '../../../supabase/functions/_shared/rights/ilgaVocabulary.ts';
export type {
  AffirmationReading,
  MarkerReading,
  RequirementReading,
} from '../../../supabase/functions/_shared/rights/ilgaVocabulary.ts';

/**
 * The trans safety dimension — three axes, rendered side by side, never summed.
 *
 *   1. Recognition & protection — ILGA, 250 countries. This IS the existing
 *      trans `LensVerdict` (supabase/functions/_shared/rights/verdict.ts).
 *      Nothing here re-derives it; do not add a second trans scorer.
 *   2. Legal depth — TGEU Trans Rights Index, 54 countries, Europe + Central Asia.
 *   3. Documented violence — TGEU Trans Murder Monitoring, 90 countries.
 *
 * AXIS 3 NEVER FEEDS AXES 1-2, and this file deliberately exposes no function
 * that could combine them. The reason is measured, not aesthetic: TMM counts
 * rank countries almost inversely to legal risk (Brazil 2,031 · Mexico 812 ·
 * United States 478, all legally progressive; Europe 5 in the whole TDoR 2025
 * period). What they mostly measure is reporting coverage. Folded into a risk
 * signal they would tell a trans traveller that Brazil is the most dangerous
 * country on earth and that Iran is safe.
 */

// ---------------------------------------------------------------------------
// Axis 3 — documented violence
// ---------------------------------------------------------------------------

/**
 * Three states, because two would lie.
 *
 * `none_recorded` is NOT `documented(0)`. TGEU monitors globally but depends on
 * local reporting, media coverage and trans-led organisations that do not exist
 * everywhere, so a country with no recorded case may be under-reported, may be
 * genuinely low-violence, or may be a place where a trans person's death is
 * never recorded as such. The UI must say so wherever this state appears.
 *
 * `unmatched` is our own failure, kept visible rather than silently rendered as
 * absence: the importer could not resolve a TGEU country label to a `countries`
 * row, so we hold no answer at all.
 */
export type MonitorState = 'documented' | 'none_recorded' | 'unmatched';

export interface TransViolenceRecord {
  state: MonitorState;
  /** Null unless state === 'documented'. Never coerce this to 0 for display. */
  total: number | null;
  /** Descending by period label, most recent first. Empty unless documented. */
  byPeriod: readonly { period: string; cases: number }[];
  latestPeriod: string | null;
  latestCases: number | null;
  fetchedAt: string | null;
  sourceUrl: string | null;
}

/** Shape written by supabase/functions/import-tgeu-tmm. */
interface RawViolenceBlob {
  source?: unknown;
  source_url?: unknown;
  total?: unknown;
  by_period?: Record<string, unknown>;
  fetched_at?: unknown;
  unmatched?: unknown;
}

const EMPTY_RECORD: TransViolenceRecord = {
  state: 'none_recorded',
  total: null,
  byPeriod: [],
  latestPeriod: null,
  latestCases: null,
  fetchedAt: null,
  sourceUrl: null,
};

function asPositiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * Period labels sort as text and that is correct here: they are 'TDoR 2008' …
 * 'TDoR 2025', a fixed-width year suffix, so lexicographic order IS chronological
 * order. Parsing a year out would add a failure mode for no gain.
 */
function comparePeriodDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export function readTransViolence(raw: unknown): TransViolenceRecord {
  if (!raw || typeof raw !== 'object') return EMPTY_RECORD;
  const blob = raw as RawViolenceBlob;

  if (blob.unmatched === true) {
    return { ...EMPTY_RECORD, state: 'unmatched' };
  }

  const byPeriod = Object.entries(blob.by_period ?? {})
    .map(([period, cases]) => ({ period, cases: asPositiveInt(cases) }))
    .filter((e): e is { period: string; cases: number } => e.cases !== null)
    .sort((a, b) => comparePeriodDesc(a.period, b.period));

  const total = asPositiveInt(blob.total);

  // A stored total of 0 (or a missing one) with no periods is `none_recorded`,
  // never `documented(0)` — see the MonitorState note.
  if (total === null && byPeriod.length === 0) {
    return {
      ...EMPTY_RECORD,
      fetchedAt: typeof blob.fetched_at === 'string' ? blob.fetched_at : null,
      sourceUrl: typeof blob.source_url === 'string' ? blob.source_url : null,
    };
  }

  return {
    state: 'documented',
    total: total ?? byPeriod.reduce((sum, e) => sum + e.cases, 0),
    byPeriod,
    latestPeriod: byPeriod[0]?.period ?? null,
    latestCases: byPeriod[0]?.cases ?? null,
    fetchedAt: typeof blob.fetched_at === 'string' ? blob.fetched_at : null,
    sourceUrl: typeof blob.source_url === 'string' ? blob.source_url : null,
  };
}

// ---------------------------------------------------------------------------
// Axis 2 — TGEU Trans Rights Index — LINKED, NEVER COPIED
// ---------------------------------------------------------------------------
//
// There is deliberately no reader here, and `countries.trans_rights_index` was
// dropped rather than left waiting to be filled. The index is rendered as an
// attributed outbound link (`TGEU_TRI_URL`) in the `index` section of
// src/pages/rights/TransRights.tsx.
//
// Two reasons. The licence one is real — the Trans Rights Map is CC BY-NC-SA
// 4.0 and this site takes payments and affiliate commission — but the durable
// one is freshness: the index is re-scored every year on IDAHOBIT, and 2026 was
// the first year in thirteen that it moved BACKWARDS. A transcribed snapshot
// goes wrong the day TGEU republishes, and nothing in this repo would notice.
// This codebase has already paid for that mistake once: see the safety-notes
// composer, where a derived field outlived the input it was derived from and
// served 86 cities another country's law for two months.
//
// If a licensed, structured feed ever arrives, add the reader back HERE and
// re-add the column in the same migration — do not scatter parsing into the
// components.

// ---------------------------------------------------------------------------
// Axis 1 — the gender-recognition ledger
// ---------------------------------------------------------------------------

/**
 * `/rights` puts `gender-recognition` in UNCOUNTED_SLUGS because the topic cannot
 * collapse into one yes/no bar the way the other 17 can — "recognition exists"
 * says nothing about whether it costs you a surgery. So it is counted HERE
 * instead, split across the facts that actually differ between countries.
 *
 * `requiresSurgery` and `requiresDiagnosis` are counted as HARMS, matching the
 * polarity inversion in verdict.ts: requiring sterilisation is not a protection
 * that happens to be missing, it is a legal injury. INV-5 caps such a country's
 * trans verdict at `hostile` no matter how much anti-discrimination law it has.
 */
export interface RecognitionLedger {
  /** Countries carrying any recorded value for this topic — the denominator. */
  measured: number;
  total: number;
  markerChangePossible: number;
  selfId: number;
  requiresSurgery: number;
  requiresDiagnosis: number;
  /**
   * The same four facts counted in PEOPLE, which is the whole point of the
   * page: 15 countries require sterilisation — 6% of the world's countries and
   * 41% of the world's people. A count of countries treats Nauru and India as
   * one unit each, and the law is written about people.
   *
   * `totalPeople` is every country's population, including the ones with no
   * recognition record, so nothing is quietly dropped from a denominator.
   */
  totalPeople: number;
  peopleMarkerChangePossible: number;
  peopleSelfId: number;
  peopleRequiresSurgery: number;
  peopleRequiresDiagnosis: number;
}

const NO_DATA = /^(no data|unknown|n\/a)$/i;

function lgrOf(row: Record<string, unknown>): Record<string, unknown> | null {
  const v = row.lgbti_gender_recognition;
  if (!v || typeof v !== 'object') return null;
  const blob = v as Record<string, unknown>;
  return Object.keys(blob).length > 0 ? blob : null;
}

/** Missing population is 0, never a dropped row — see `totalPeople`. */
function popOf(row: Record<string, unknown>): number {
  const n = Number(row.population ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function summariseRecognition(rows: readonly Record<string, unknown>[]): RecognitionLedger {
  const ledger: RecognitionLedger = {
    measured: 0,
    total: rows.length,
    markerChangePossible: 0,
    selfId: 0,
    requiresSurgery: 0,
    requiresDiagnosis: 0,
    totalPeople: 0,
    peopleMarkerChangePossible: 0,
    peopleSelfId: 0,
    peopleRequiresSurgery: 0,
    peopleRequiresDiagnosis: 0,
  };

  for (const row of rows) {
    const pop = popOf(row);
    ledger.totalPeople += pop;

    const lgr = lgrOf(row);
    if (!lgr) continue;
    ledger.measured += 1;

    const marker = String(lgr.gender_marker ?? '').trim();
    if (marker && !NO_DATA.test(marker) && markerChangePossible(marker)) {
      ledger.markerChangePossible += 1;
      ledger.peopleMarkerChangePossible += pop;
    }
    if (isAffirmed(lgr.self_id)) {
      ledger.selfId += 1;
      ledger.peopleSelfId += pop;
    }
    // `requiresIt`, not `isYes`. ILGA writes "Required"; every reader in this
    // repo used to test /^yes$/i, so these two counters read 0 on all 244
    // measured countries while the true answers were 15 and 21.
    if (requiresIt(lgr.requires_surgery)) {
      ledger.requiresSurgery += 1;
      ledger.peopleRequiresSurgery += pop;
    }
    if (requiresIt(lgr.requires_diagnosis)) {
      ledger.requiresDiagnosis += 1;
      ledger.peopleRequiresDiagnosis += pop;
    }
  }

  return ledger;
}

/** The catalog entry, so the page can reuse the shared icon and label. */
export const GENDER_RECOGNITION_TOPIC = RIGHT_TOPICS.find((t) => t.slug === 'gender-recognition')!;

// ---------------------------------------------------------------------------
// Shared attribution
// ---------------------------------------------------------------------------

export const TGEU_TMM_URL = 'https://transmurdermonitoring.tgeu.org/';
export const TGEU_TRI_URL = 'https://transrightsmap.tgeu.org/';

/**
 * Rendered wherever a count appears, as the FIRST thing in the section and not
 * as a footnote. TGEU's own wording, compressed.
 */
export const TMM_REPORTING_CAVEAT =
  'These are cases TGEU was able to document. They depend on local reporting, media ' +
  'coverage and trans-led organisations, which do not exist everywhere. A low number ' +
  'means little was recorded, not that a place is safe — and a high number often means ' +
  'a country has activists who count.';
