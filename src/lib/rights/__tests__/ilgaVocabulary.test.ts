import { describe, expect, it } from 'vitest';
import {
  LGR_VOCABULARY,
  affirmationPolarity,
  isAffirmed,
  isKnownLgrValue,
  markerChangePossible,
  markerPolarity,
  readAffirmation,
  readMarker,
  readRequirement,
  requirementPolarity,
  requiresIt,
  type LgrField,
} from '../../../../supabase/functions/_shared/rights/ilgaVocabulary.ts';

/**
 * The guard that would have caught the bug this module was written for.
 *
 * Until 2026-09-01 the fixtures in verdict.test.ts and transSafety.test.ts used
 * `requires_surgery: 'Yes'` — a value that occurs zero times in production.
 * The tests passed, the readers were wrong, and `/rights/trans` published
 * "Requires surgery 0 / 244" for as long as the page had existed.
 *
 * So this file pins what the DATABASE holds, not what a fixture author
 * imagined, measured across the 244 rows with a non-empty
 * `lgbti_gender_recognition` (project xqeacpakadqfxjxjcewc, 2026-09-01).
 * Re-measure with:
 *
 *   select lgbti_gender_recognition->>'<field>', count(*)
 *   from countries where lgbti_gender_recognition::text <> '{}' group by 1;
 */
const LIVE: Record<LgrField, { values: [string, number][]; nulls: number }> = {
  gender_marker: {
    values: [
      ['Not Possible', 78],
      ['Possible', 74],
      ['No data', 69],
      ['Nominally Possible', 14],
      ['Not Possible (exceptions documented)', 4],
      ['Unclear', 4],
      ['Varies', 1],
    ],
    nulls: 0,
  },
  name_change: {
    values: [
      ['Possible', 90],
      ['No data', 74],
      ['Nominally Possible', 40],
      ['Not Possible', 34],
      ['Unclear', 5],
      ['Varies', 1],
    ],
    nulls: 0,
  },
  self_id: {
    values: [
      ['No', 138],
      ['No data', 70],
      ['Yes', 22],
      ['Varies', 7],
      ['Unclear', 4],
      ['N/A', 2],
      ['Yes (for NB marker only)', 1],
    ],
    nulls: 0,
  },
  established_procedure: {
    values: [
      ['No', 106],
      ['Yes', 64],
      ['Unclear', 4],
      ['N/A', 2],
    ],
    // This field, alone, is genuinely absent on some rows rather than carrying
    // the string "No data". `unrecorded` must cover both.
    nulls: 68,
  },
  requires_surgery: {
    values: [
      ['N/A', 74],
      ['No data', 70],
      ['Not required', 51],
      ['Unclear', 28],
      ['Required', 15],
      ['Varies', 6],
    ],
    nulls: 0,
  },
  requires_diagnosis: {
    values: [
      ['N/A', 75],
      ['No data', 70],
      ['Not required', 37],
      ['Unclear', 35],
      ['Required', 21],
      ['Varies', 6],
    ],
    nulls: 0,
  },
};

const MEASURED_ROWS = 244;
const FIELDS = Object.keys(LIVE) as LgrField[];

describe('LGR vocabulary drift', () => {
  it.each(FIELDS)('%s: the live values sum to every measured row', (field) => {
    const total = LIVE[field].values.reduce((sum, [, n]) => sum + n, 0) + LIVE[field].nulls;
    expect(total).toBe(MEASURED_ROWS);
  });

  // Both directions. A value in the DB that the module has never seen is a
  // silent wrong answer; a value in the module that the DB does not hold is an
  // unmeasured guess. Neither may pass.
  it.each(FIELDS)('%s: every live value is known to the module', (field) => {
    for (const [value] of LIVE[field].values) {
      expect(isKnownLgrValue(field, value), `${field} = ${value}`).toBe(true);
    }
  });

  it.each(FIELDS)('%s: the module claims no value the DB does not hold', (field) => {
    const live = new Set(LIVE[field].values.map(([v]) => v.toLowerCase()));
    for (const claimed of LGR_VOCABULARY[field]) {
      expect(live.has(claimed.toLowerCase()), `${field} claims unmeasured ${claimed}`).toBe(true);
    }
  });
});

describe('readRequirement', () => {
  it('reads the real vocabulary', () => {
    expect(readRequirement('Required')).toBe('required');
    expect(readRequirement('Not required')).toBe('not_required');
    expect(readRequirement('N/A')).toBe('inapplicable');
    expect(readRequirement('No data')).toBe('unrecorded');
    expect(readRequirement('Unclear')).toBe('indeterminate');
    expect(readRequirement('Varies')).toBe('indeterminate');
    expect(readRequirement(null)).toBe('unrecorded');
    expect(readRequirement('')).toBe('unrecorded');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(readRequirement('  REQUIRED ')).toBe('required');
    expect(readRequirement('not  required')).toBe('not_required');
  });

  /**
   * The negative control, and the reason this file exists. `Yes` and `No` are
   * NOT this field's vocabulary. If someone reintroduces the /^yes$/i test by
   * copying it from a protection column, this fails.
   */
  it('does not accept Yes/No — that was the bug', () => {
    expect(readRequirement('Yes')).toBe('indeterminate');
    expect(readRequirement('No')).toBe('indeterminate');
    expect(requiresIt('Yes')).toBe(false);
    expect(requirementPolarity('Yes')).toBe('absent');
    expect(requirementPolarity('No')).toBe('absent');
  });

  it('treats only "Required" as the harm', () => {
    expect(requiresIt('Required')).toBe(true);
    for (const v of ['Not required', 'N/A', 'No data', 'Unclear', 'Varies', null]) {
      expect(requiresIt(v), String(v)).toBe(false);
    }
  });

  /**
   * N/A is inapplicable, never a positive. Cross-tabbed on prod, 100% of the
   * 74 N/A rows also carry gender_marker "Not Possible" and
   * established_procedure "No": there is no procedure for a condition to
   * attach to. A positive here would credit the 74 worst countries with "does
   * not require sterilisation".
   */
  it('never reads N/A as a positive finding', () => {
    expect(requirementPolarity('N/A')).toBe('absent');
    expect(requirementPolarity('N/A')).not.toBe('positive');
  });

  /**
   * Unclear/Varies are absent, NOT negative — the opposite of polarityOf's
   * fallthrough, because polarity is inverted here. Mapping them negative
   * would cap ten countries at `hostile` on no evidence, Australia among them.
   */
  it('never accuses on Unclear or Varies', () => {
    expect(requirementPolarity('Unclear')).toBe('absent');
    expect(requirementPolarity('Varies')).toBe('absent');
  });

  it('maps the two decided values to inverted polarity', () => {
    expect(requirementPolarity('Required')).toBe('negative');
    expect(requirementPolarity('Not required')).toBe('positive');
  });
});

describe('readAffirmation', () => {
  it('reads the real vocabulary', () => {
    expect(readAffirmation('Yes')).toBe('yes');
    expect(readAffirmation('No')).toBe('no');
    expect(readAffirmation('N/A')).toBe('inapplicable');
    expect(readAffirmation('No data')).toBe('unrecorded');
    expect(readAffirmation('Unclear')).toBe('indeterminate');
    expect(readAffirmation('Varies')).toBe('indeterminate');
  });

  /** Nepal, and only Nepal. Not general self-determination. */
  it('does not count "Yes (for NB marker only)" as self-determination', () => {
    expect(readAffirmation('Yes (for NB marker only)')).toBe('yes_qualified');
    expect(isAffirmed('Yes (for NB marker only)')).toBe(false);
    expect(affirmationPolarity('Yes (for NB marker only)')).toBe('negative');
  });

  it('preserves polarityOf behaviour so no verdict moves', () => {
    expect(affirmationPolarity('Yes')).toBe('positive');
    expect(affirmationPolarity('No')).toBe('negative');
    expect(affirmationPolarity('N/A')).toBe('absent');
    expect(affirmationPolarity('No data')).toBe('absent');
    expect(affirmationPolarity('')).toBe('absent');
  });

  /**
   * INV-6, which landed on main while this branch was open and which the merge
   * would otherwise have silently reverted for `lgr.self_id`.
   *
   * `Varies` is how ILGA codes a federation whose sub-jurisdictions disagree
   * and `Unclear` is its own admission of doubt; absence of a national answer
   * is not evidence of hostility. `self_id` reaches the engine through `ev()`
   * → `polarityOf`, so main made these absent — and this reader has to agree
   * or the 11 countries carrying those values get a recorded negative for a
   * fact nobody recorded.
   *
   * Note `gender_marker` is NOT the same case: main kept its inline ternary,
   * where `Varies` is still negative, so `markerPolarity` deliberately differs
   * from this. The asymmetry is real, not an oversight.
   */
  it('treats an indeterminate self_id as absent, per INV-6', () => {
    expect(affirmationPolarity('Unclear')).toBe('absent');
    expect(affirmationPolarity('Varies')).toBe('absent');
  });
});

describe('readMarker', () => {
  it('reads the real vocabulary', () => {
    expect(readMarker('Possible')).toBe('possible');
    expect(readMarker('Nominally Possible')).toBe('nominally_possible');
    expect(readMarker('Not Possible')).toBe('not_possible');
    expect(readMarker('Not Possible (exceptions documented)')).toBe('not_possible');
    expect(readMarker('No data')).toBe('unrecorded');
    expect(readMarker('Unclear')).toBe('indeterminate');
    expect(readMarker('Varies')).toBe('indeterminate');
  });

  it('never counts a nominal procedure as possible', () => {
    expect(markerChangePossible('Possible')).toBe(true);
    expect(markerChangePossible('Nominally Possible')).toBe(false);
  });

  /**
   * lgr.gender_marker IS in REQUIRED.trans, so these feed coverageOf and
   * INV-2. This must stay byte-identical to the ternary it replaced or trans
   * verdicts move for a reason unrelated to any bug.
   */
  it('is identical to the ternary it replaced', () => {
    const old = (marker: string) =>
      /^possible$/i.test(marker)
        ? 'positive'
        : marker && !/^no data$/i.test(marker)
          ? 'negative'
          : 'absent';
    for (const [value] of LIVE.gender_marker.values) {
      expect(markerPolarity(value), value).toBe(old(value));
    }
    expect(markerPolarity('')).toBe(old(''));
  });
});
