/**
 * ILGA legal-status values → a monochrome polarity + a stable i18n key.
 *
 * Extracted from LGBTJurisdictionInfo so it can be tested in isolation. It
 * could not be before, and the substring heuristic it replaces was wrong on
 * 267 rows measured against live data on 2026-08-08:
 *
 *   "Explicit Legal Barriers"        60 countries  rendered ✓ positive
 *   "Legal Barriers Likely to Exist" 63 countries  rendered ✓ positive
 *   "Joint & Second Parent Adoption" 62 countries  rendered – partial
 *   "Not Possible" (gender marker)   82 countries  rendered – partial
 *
 * The first two are the interesting ones: the old classifier tested
 * `v.includes('legal')` in its POSITIVE branch, so every phrase describing a
 * legal barrier to LGBTQ+ expression or association scored as a protection.
 * Its comment warned about exactly this class of error ("not banned" contains
 * "banned") and then guarded only that one phrase.
 *
 * So this is a closed vocabulary, not a heuristic. Values are matched whole,
 * lowercased and whitespace-collapsed. An unrecognised value is `unknown` —
 * never guessed into a polarity — and still renders its raw text, so a new
 * ILGA spelling degrades to "shown but uncoloured" rather than to a wrong
 * claim. `rightsValue.test.ts` pins the full live vocabulary.
 */

/** Monochrome polarity. `severe` is the ONLY one that may use --destructive. */
export type StatusKind = 'yes' | 'no' | 'severe' | 'partial' | 'none';

export interface RightValue {
  kind: StatusKind;
  /** Stable suffix for `rights.value.<key>`; null when there is nothing to show. */
  valueKey: string | null;
  /** Verbatim source text. The i18n fallback, so an unmapped value still reads. */
  raw: string | null;
}

interface VocabEntry {
  kind: StatusKind;
  key: string;
}

/**
 * Keys are the normalized form: lowercased, whitespace-collapsed, trimmed.
 *
 * `severe` is reserved for state prohibition — criminalisation itself and
 * *explicit* legal barriers, which in this dataset are propaganda and
 * public-order statutes carrying criminal penalties. Barriers recorded as
 * non-explicit or merely likely are negative but not criminal, so they take
 * `no` and stay monochrome.
 */
const VOCAB: Record<string, VocabEntry> = {
  // -- Criminalisation (synthesised by the caller, not raw ILGA) --------------
  legal: { kind: 'yes', key: 'legal' },
  criminalised: { kind: 'severe', key: 'criminalised' },

  // -- Freedom of expression / association ------------------------------------
  'no known legal barriers': { kind: 'yes', key: 'noKnownLegalBarriers' },
  'non-explicit legal barriers': { kind: 'no', key: 'nonExplicitLegalBarriers' },
  'explicit legal barriers': { kind: 'severe', key: 'explicitLegalBarriers' },
  'legal barriers likely to exist': { kind: 'no', key: 'legalBarriersLikely' },

  // -- Same-sex unions --------------------------------------------------------
  marriage: { kind: 'yes', key: 'marriage' },
  'marriage & civil union': { kind: 'yes', key: 'marriageAndCivilUnion' },
  'civil union only': { kind: 'partial', key: 'civilUnionOnly' },

  // -- Adoption ---------------------------------------------------------------
  'joint & second parent adoption': { kind: 'yes', key: 'jointAndSecondParentAdoption' },
  'second parent adoption only': { kind: 'partial', key: 'secondParentAdoptionOnly' },
  'no adoption possible': { kind: 'no', key: 'noAdoptionPossible' },

  // -- Conversion therapy -----------------------------------------------------
  banned: { kind: 'yes', key: 'banned' },
  'not banned': { kind: 'no', key: 'notBanned' },
  indirect: { kind: 'partial', key: 'indirect' },

  // -- Gender recognition -----------------------------------------------------
  possible: { kind: 'yes', key: 'possible' },
  'nominally possible': { kind: 'partial', key: 'nominallyPossible' },
  'not possible': { kind: 'no', key: 'notPossible' },
  'not possible (exceptions documented)': { kind: 'no', key: 'notPossibleWithExceptions' },
  'yes (for nb marker only)': { kind: 'partial', key: 'yesNonBinaryMarkerOnly' },

  // -- Generic ----------------------------------------------------------------
  yes: { kind: 'yes', key: 'yes' },
  no: { kind: 'no', key: 'no' },
  varies: { kind: 'partial', key: 'varies' },
  unclear: { kind: 'partial', key: 'unclear' },
  'n/a': { kind: 'none', key: 'notApplicable' },
};

/** Values that mean "we hold nothing", rendered as absence rather than a claim. */
const EMPTY = new Set(['', 'no data', 'unknown', 'null', 'undefined']);

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Classify one legal-status value.
 *
 * `severeNegative` marks a field where a negative is a criminal exposure
 * rather than a missing protection, so it routes to --destructive.
 */
export function readRightValue(
  value: string | boolean | null | undefined,
  severeNegative = false,
): RightValue {
  if (value === true) return { kind: 'yes', valueKey: 'yes', raw: 'Yes' };
  if (value === false) {
    return { kind: severeNegative ? 'severe' : 'no', valueKey: 'no', raw: 'No' };
  }

  const raw = value == null ? null : String(value);
  const norm = normalize(raw ?? '');
  if (EMPTY.has(norm)) return { kind: 'none', valueKey: null, raw: null };

  const hit = VOCAB[norm];
  if (!hit) {
    // Unrecognised. Deliberately NOT guessed: `partial` reads as "we have
    // something and it is mixed", which is honest for an unmapped value, and
    // the raw text still renders so the reader sees the source's own words.
    return { kind: 'partial', valueKey: null, raw };
  }

  const kind = hit.kind === 'no' && severeNegative ? 'severe' : hit.kind;
  return { kind, valueKey: hit.key, raw };
}

/** Vocabulary coverage, for the drift test. */
export const KNOWN_RIGHT_VALUES: readonly string[] = Object.keys(VOCAB);


/**
 * The scalar a topic's column actually carries.
 *
 * Lifted verbatim out of LGBTJurisdictionInfo so the country card and the
 * /rights index read ONE implementation. Two columns are objects whose
 * headline string lives on a named key; the rest are already scalars. Getting
 * this wrong does not throw — it yields `none` and silently undercounts a
 * legal protection, which on this page is the expensive kind of wrong.
 */
export function topicScalarValue(
  country: Record<string, unknown>,
  topic: { slug: string; column: string },
): unknown {
  const raw = country[topic.column];
  if (topic.slug === 'expression') return (raw as Record<string, unknown> | null)?.summary;
  if (topic.slug === 'association') return (raw as Record<string, unknown> | null)?.status;
  return raw;
}
