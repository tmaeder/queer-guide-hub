import type { Polarity } from './types.ts';

/**
 * The ILGA legal-gender-recognition vocabulary, read in ONE place.
 *
 * `import-ilga-data/index.ts:266` passes ILGA's labels through verbatim
 * (`gm_surgery_gm_value?.name`), so `lgbti_gender_recognition` holds ILGA's
 * words, not ours. Six call sites independently guessed those words wrong and
 * tested `requires_surgery` / `requires_diagnosis` with `/^yes$/i` — a value
 * that does not occur in this dataset at all. Measured consequences, live:
 *
 *   · `/rights/trans` published "Requires surgery 0 / 244" (truth: 15) and
 *     "Requires a psychiatric diagnosis 0 / 244" (truth: 21).
 *   · The "Where the law demands surgery" section rendered for nobody.
 *   · `TransSafetyBand` printed "Surgery required first: No" on Japan, Iran,
 *     Turkey and Romania — an affirmative false negative to a trans reader,
 *     which is worse than the omission.
 *   · INV-5 in verdict.ts ("a sterilisation requirement caps the trans verdict
 *     at `hostile`") had never fired for any country since it was written.
 *
 * The tests did not catch it because their fixtures used `'Yes'`/`'No'` — a
 * vocabulary invented by the fixture. Hence `LGR_VOCABULARY` below: the values
 * are pinned to what production actually holds, asserted in both directions,
 * so the next vocabulary change fails CI instead of silently zeroing a row.
 *
 * This file lives beside verdict.ts rather than in src/lib/rights/ because it
 * must resolve from three runtimes — Deno (the nightly importer), Vite (the
 * page imports verdict.ts by relative path already) and Vitest. Deno cannot
 * resolve the `@/` alias, so src/ is disqualified. Keep it dependency-free:
 * no aliases, explicit `.ts` extensions, no runtime globals.
 */

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** The same shape `src/lib/rights/rightsValue.ts` uses, so the two agree. */
function norm(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// requires_surgery / requires_diagnosis — INVERTED POLARITY
// ---------------------------------------------------------------------------

/**
 * `required` is a legal HARM, not a missing protection. That inversion is the
 * reason these two fields need their own reader rather than `polarityOf`.
 */
export type RequirementReading =
  /** "Required" — the state demands it. */
  | 'required'
  /** "Not required" — a recorded finding that it does not. */
  | 'not_required'
  /** "N/A" — no marker-change procedure exists, so the question cannot apply. */
  | 'inapplicable'
  /** "Unclear" | "Varies" | anything unmapped. */
  | 'indeterminate'
  /** "No data" | null | ''. */
  | 'unrecorded';

export function readRequirement(raw: unknown): RequirementReading {
  const v = norm(raw);
  if (!v) return 'unrecorded';
  if (v === 'required') return 'required';
  if (v === 'not required') return 'not_required';
  if (v === 'n/a') return 'inapplicable';
  if (v === 'no data') return 'unrecorded';
  if (v === 'unclear' || v === 'varies') return 'indeterminate';
  return 'indeterminate';
}

/**
 * Two mappings here are deliberate and will read as bugs to someone who has
 * only seen `polarityOf`. Both are load-bearing.
 *
 * `N/A` → absent, NEVER positive. Cross-tabbed on all 244 measured rows, 100%
 * of the 74 `N/A` rows also carry `gender_marker = "Not Possible"` and
 * `established_procedure = "No"`: there is no procedure for a condition to
 * attach to. Reading that as "does not require sterilisation" would hand a
 * positive finding to the 74 WORST countries in the dataset. The harm those
 * countries do is already recorded by `lgr.gender_marker` → negative.
 *
 * `Unclear` / `Varies` → absent, departing from `polarityOf`'s `negative`
 * fallthrough (verdict.ts:53). THE POLARITY INVERSION IS THE WHOLE REASON. On
 * a protection column `negative` means "we cannot confirm this protection
 * exists" — conservative, and right. On a harm column it means "this state
 * demands sterilisation" — an accusation we cannot support. Mapping them
 * negative would falsely cap TEN countries at `hostile`: Australia, Cocos,
 * Christmas Is., Norfolk Is. (`Varies`) and Slovenia, Slovakia, Kosovo, North
 * Macedonia, Moldova, Peru (`Unclear`). Australia has no national
 * sterilisation requirement; several states abolished theirs.
 *
 * The usual argument for preferring `negative` — that `absent` costs coverage
 * — does not apply: neither key appears in `REQUIRED.trans`, so `coverageOf`
 * never inspects them and INV-2 cannot move either way.
 */
export function requirementPolarity(raw: unknown): Polarity {
  switch (readRequirement(raw)) {
    case 'required':
      return 'negative';
    case 'not_required':
      return 'positive';
    default:
      return 'absent';
  }
}

/** True ONLY for "Required". The predicate INV-5 and the harm ledgers use. */
export function requiresIt(raw: unknown): boolean {
  return readRequirement(raw) === 'required';
}

// ---------------------------------------------------------------------------
// self_id / established_procedure — genuinely Yes/No
// ---------------------------------------------------------------------------

export type AffirmationReading =
  | 'yes'
  /** "Yes (for NB marker only)" — Nepal, and only Nepal. Not general self-ID. */
  | 'yes_qualified'
  | 'no'
  | 'inapplicable'
  | 'indeterminate'
  | 'unrecorded';

export function readAffirmation(raw: unknown): AffirmationReading {
  const v = norm(raw);
  if (!v) return 'unrecorded';
  if (v === 'yes') return 'yes';
  if (v === 'no') return 'no';
  if (v === 'n/a') return 'inapplicable';
  if (v === 'no data') return 'unrecorded';
  if (v.startsWith('yes (')) return 'yes_qualified';
  if (v === 'unclear' || v === 'varies') return 'indeterminate';
  return 'indeterminate';
}

/**
 * Behaviour-identical to routing these through `polarityOf`, which is the
 * point: this replaces the last private copy without moving any verdict.
 * `yes_qualified` resolves to `negative` — a binary trans person in Nepal
 * cannot self-declare — but it now gets there by decision rather than by
 * falling through the branch that also handles typos.
 */
export function affirmationPolarity(raw: unknown): Polarity {
  switch (readAffirmation(raw)) {
    case 'yes':
      return 'positive';
    case 'inapplicable':
    case 'unrecorded':
      return 'absent';
    default:
      return 'negative';
  }
}

/** True ONLY for a bare "Yes" — deliberately NOT "Yes (for NB marker only)". */
export function isAffirmed(raw: unknown): boolean {
  return readAffirmation(raw) === 'yes';
}

// ---------------------------------------------------------------------------
// gender_marker / name_change
// ---------------------------------------------------------------------------

export type MarkerReading =
  | 'possible'
  /** "Nominally Possible" — a procedure on paper. Never counted as possible. */
  | 'nominally_possible'
  | 'not_possible'
  | 'indeterminate'
  | 'unrecorded';

export function readMarker(raw: unknown): MarkerReading {
  const v = norm(raw);
  if (!v) return 'unrecorded';
  if (v === 'possible') return 'possible';
  if (v === 'nominally possible') return 'nominally_possible';
  if (v === 'no data') return 'unrecorded';
  if (v.startsWith('not possible')) return 'not_possible';
  if (v === 'unclear' || v === 'varies') return 'indeterminate';
  return 'indeterminate';
}

/**
 * Byte-identical to the ternary it replaces (verdict.ts:222-227): "Possible"
 * is positive, empty and "No data" are absent, everything else — including
 * "Nominally Possible", "Unclear" and "Varies" — is negative.
 *
 * Do not "improve" this while replacing it. `lgr.gender_marker` IS in
 * `REQUIRED.trans`, so its absent-ness feeds `coverageOf` and INV-2; a change
 * here moves trans verdicts on country pages for a reason unrelated to any
 * bug being fixed.
 */
export function markerPolarity(raw: unknown): Polarity {
  switch (readMarker(raw)) {
    case 'possible':
      return 'positive';
    case 'unrecorded':
      return 'absent';
    default:
      return 'negative';
  }
}

/** The ledger's "gender marker change is possible" predicate. */
export function markerChangePossible(raw: unknown): boolean {
  return readMarker(raw) === 'possible';
}

// ---------------------------------------------------------------------------
// The drift guard's input
// ---------------------------------------------------------------------------

export type LgrField =
  | 'gender_marker'
  | 'name_change'
  | 'self_id'
  | 'established_procedure'
  | 'requires_surgery'
  | 'requires_diagnosis';

/**
 * Every value observed in production, per field, measured across the 244 rows
 * carrying a non-empty `lgbti_gender_recognition`.
 *
 * This is a SNAPSHOT and is asserted in both directions by
 * src/lib/rights/__tests__/ilgaVocabulary.test.ts — a value here that is not
 * in the test's live table fails just as loudly as the reverse. The test is
 * the reason this constant exists; do not add to it from a guess.
 */
export const LGR_VOCABULARY: Readonly<Record<LgrField, readonly string[]>> = {
  gender_marker: [
    'Not Possible',
    'Possible',
    'No data',
    'Nominally Possible',
    'Not Possible (exceptions documented)',
    'Unclear',
    'Varies',
  ],
  name_change: ['Possible', 'No data', 'Nominally Possible', 'Not Possible', 'Unclear', 'Varies'],
  self_id: ['No', 'No data', 'Yes', 'Varies', 'Unclear', 'N/A', 'Yes (for NB marker only)'],
  established_procedure: ['No', 'Yes', 'Unclear', 'N/A'],
  requires_surgery: ['N/A', 'No data', 'Not required', 'Unclear', 'Required', 'Varies'],
  requires_diagnosis: ['N/A', 'No data', 'Not required', 'Unclear', 'Required', 'Varies'],
};

/** Case- and whitespace-insensitive membership, matching the readers above. */
export function isKnownLgrValue(field: LgrField, raw: unknown): boolean {
  const v = norm(raw);
  if (!v) return false;
  return LGR_VOCABULARY[field].some((known) => norm(known) === v);
}
