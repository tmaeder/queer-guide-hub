import { describe, it, expect } from 'vitest';
import {
  computeLens,
  computeRightsProfile,
  worstOf,
} from '../../../../supabase/functions/_shared/rights/verdict.ts';
import { VERDICT_ORDER } from '../../../../supabase/functions/_shared/rights/types.ts';
import type { LensVerdict } from '../../../../supabase/functions/_shared/rights/types.ts';

/**
 * The engine lives under supabase/functions/_shared so the nightly ILGA
 * importer (Deno) can compute the verdict in the same UPDATE that writes the
 * legal columns. Its tests live HERE because vitest's include is
 * `src/**` — ten test files sitting next to the _shared modules have never
 * executed under `npm test`. Same relative-import pattern as
 * src/lib/__tests__/personalityWikidataResolve.test.ts.
 */

const protectAll = (v: string) => ({ so: v, gi: v, ge: v, sc: v });

/** A country with broad protections and no criminalisation. */
function goodRow(over: Record<string, unknown> = {}) {
  return {
    lgbti_criminalization: { legal: true, death_penalty: 'No', decrim_year_1: '1969' },
    lgbti_same_sex_unions: JSON.stringify({ summary: 'Marriage', marriage_since: '2001' }),
    lgbti_adoption_rights: 'Joint & Second Parent Adoption',
    lgbti_constitutional_protection: protectAll('Yes'),
    lgbti_employment_protection: protectAll('Yes'),
    lgbti_housing_protection: protectAll('Yes'),
    lgbti_education_protection: protectAll('Yes'),
    lgbti_health_protection: protectAll('Yes'),
    lgbti_goods_services_protection: protectAll('Yes'),
    lgbti_bullying_protection: protectAll('Yes'),
    lgbti_hate_crime_law: protectAll('Yes'),
    lgbti_incitement_prohibition: protectAll('Yes'),
    lgbti_gender_recognition: {
      gender_marker: 'Possible',
      self_id: 'Yes',
      // ILGA's vocabulary, not Yes/No. This fixture said 'No' until
      // 2026-09-01 — a value the column has never held, which is precisely
      // why the readers were wrong and every test still passed.
      requires_surgery: 'Not required',
      requires_diagnosis: 'Not required',
    },
    lgbti_conversion_therapy_regulation: 'Banned',
    lgbti_intersex_protection: 'Yes',
    lgbti_data_last_updated: '2026-08-07',
    ...over,
  };
}

describe('INV-1 — criminalisation dominates every lens', () => {
  it('no accumulation of protections can lift a criminalising country', () => {
    // Every protection set to Yes, then criminalisation switched on. The
    // additive scalar CAN reach >= 50 here, which is why the crim_consistency
    // release gate has to exist. This is the same fact as a type.
    const row = goodRow({
      lgbti_criminalization: { legal: false, death_penalty: 'No', penalty: '10 years in prison' },
    });
    const p = computeRightsProfile(row);
    for (const lens of ['general', 'lgb', 'trans', 'intersex'] as const) {
      expect(['criminalized', 'criminalized-severe'], `${lens} was ${p[lens].verdict}`).toContain(
        p[lens].verdict,
      );
    }
  });

  it('escalates to criminalized-severe on a confirmed capital penalty', () => {
    const row = goodRow({
      lgbti_criminalization: { legal: false, death_penalty: 'Yes', penalty: 'Death Penalty' },
    });
    expect(computeRightsProfile(row).general.verdict).toBe('criminalized-severe');
  });

  it('treats recorded uncertainty as severe, not as absence', () => {
    // Afghanistan, Pakistan, Qatar, Somalia, UAE: ILGA records
    // death_penalty='No legal certainty' with penalty='Death Penalty (possible)'.
    const row = goodRow({
      lgbti_criminalization: {
        legal: false,
        death_penalty: 'No legal certainty',
        penalty: 'Death Penalty (possible)',
      },
    });
    expect(computeRightsProfile(row).general.verdict).toBe('criminalized-severe');
  });

  it('catches a capital penalty named only in the sibling field', () => {
    // Nigeria's inverse: the flag is absent but the penalty prose names death.
    const row = goodRow({
      lgbti_criminalization: { legal: false, death_penalty: 'No', penalty: 'Death Penalty' },
    });
    expect(computeRightsProfile(row).general.verdict).toBe('criminalized-severe');
  });
});

describe('INV-2 — thin data is unknown, never partial', () => {
  it('returns unknown when most required inputs are missing', () => {
    const p = computeRightsProfile({ lgbti_criminalization: {} });
    expect(p.lgb.verdict).toBe('unknown');
    expect(p.trans.verdict).toBe('unknown');
    expect(p.intersex.verdict).toBe('unknown');
  });

  it('never upgrades unknown to partial', () => {
    const p = computeRightsProfile({});
    expect(p.general.verdict).toBe('unknown');
    expect(p.general.headline).toBe('');
  });

  it('unknown is outside the order, not a middle rank', () => {
    expect(VERDICT_ORDER.unknown).toBeLessThan(VERDICT_ORDER['criminalized-severe']);
  });
});

describe('INV-3 — absent never counts as positive or negative evidence', () => {
  it('distinguishes an empty blob from a recorded No', () => {
    // mapProtection(undefined) writes {}; a measured negative writes {so:'No'}.
    const empty = computeLens({ ...goodRow(), lgbti_employment_protection: {} }, 'lgb');
    const measured = computeLens(
      { ...goodRow(), lgbti_employment_protection: protectAll('No') },
      'lgb',
    );
    expect(empty.evidence.find((e) => e.key === 'employment.so')?.polarity).toBe('absent');
    expect(measured.evidence.find((e) => e.key === 'employment.so')?.polarity).toBe('negative');
  });

  it('treats "No data" as absent rather than as a finding', () => {
    const l = computeLens({ ...goodRow(), lgbti_intersex_protection: 'No data' }, 'intersex');
    expect(l.evidence.find((e) => e.key === 'intersex.protection')?.polarity).toBe('absent');
  });
});

describe('INV-4 — worstOf is a minimum, never an average', () => {
  const mk = (lens: LensVerdict['lens'], verdict: LensVerdict['verdict']): LensVerdict => ({
    lens,
    verdict,
    coverage: 1,
    evidence: [],
    notCovered: [],
    headline: `${lens}:${verdict}`,
  });

  it('returns the worst member, not the mean', () => {
    // The whole argument for the model: averaging hides the person most at
    // risk. protected + hostile must never read as partial.
    expect(worstOf([mk('lgb', 'protected'), mk('trans', 'hostile')]).verdict).toBe('hostile');
  });

  it('caps at partial when any lens is unknown', () => {
    expect(worstOf([mk('lgb', 'protected'), mk('trans', 'unknown')]).verdict).toBe('partial');
  });

  it('is unknown only when nothing is measured', () => {
    expect(worstOf([mk('lgb', 'unknown'), mk('trans', 'unknown')]).verdict).toBe('unknown');
  });
});

describe('INV-5 — a sterilisation requirement caps the trans verdict', () => {
  it('cannot read as protected however many protections exist', () => {
    // requires_surgery contributes exactly 0 to the scalar. Here it is a hard
    // ceiling: a state demanding sterilisation for legal recognition is not
    // protecting trans people, whatever else it does.
    const row = goodRow({
      lgbti_gender_recognition: {
        gender_marker: 'Possible',
        self_id: 'Yes',
        requires_surgery: 'Required',
        requires_diagnosis: 'Not required',
      },
    });
    const p = computeRightsProfile(row);
    expect(p.trans.verdict).toBe('hostile');
    // ...and it drags the general verdict down with it.
    expect(p.general.verdict).toBe('hostile');
    // ...while the LGB lens is unaffected, which is the point of lenses.
    expect(p.lgb.verdict).toBe('protected');
  });

  /**
   * The shape this invariant exists for, and the one it never saw until
   * 2026-09-01. Montenegro scores 99/100 on `equality_score` and requires
   * sterilisation; while the vocabulary was misread it published as `partial`.
   */
  it('caps a country whose other protections would otherwise lift it', () => {
    const row = goodRow({
      lgbti_gender_recognition: {
        gender_marker: 'Possible',
        self_id: 'No',
        requires_surgery: 'Required',
        requires_diagnosis: 'Required',
      },
    });
    expect(computeRightsProfile(row).trans.verdict).toBe('hostile');
  });

  /**
   * The other half of the invariant, and the more dangerous half to get
   * wrong. None of these is a sterilisation requirement, and reading them as
   * one would cap ten countries on no evidence — Australia, Slovenia,
   * Slovakia, Kosovo, North Macedonia, Moldova, Peru and three Australian
   * territories.
   */
  it.each(['N/A', 'Unclear', 'Varies', 'No data'])(
    'does not fire on requires_surgery = %s',
    (value) => {
      const row = goodRow({
        lgbti_gender_recognition: {
          gender_marker: 'Possible',
          self_id: 'Yes',
          requires_surgery: value,
          requires_diagnosis: 'Not required',
        },
      });
      expect(computeRightsProfile(row).trans.verdict).not.toBe('hostile');
    },
  );

  /** The dead-code guard: 'Yes' is not this column's vocabulary. */
  it('does not fire on the Yes this used to test for', () => {
    const row = goodRow({
      lgbti_gender_recognition: {
        gender_marker: 'Possible',
        self_id: 'Yes',
        requires_surgery: 'Yes',
        requires_diagnosis: 'Not required',
      },
    });
    expect(computeRightsProfile(row).trans.verdict).not.toBe('hostile');
  });
});

describe('the lenses read genuinely different columns', () => {
  it('a country protecting SO but not GI/GE splits by lens', () => {
    const row = goodRow({
      lgbti_employment_protection: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_constitutional_protection: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_housing_protection: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_education_protection: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_health_protection: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_goods_services_protection: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_bullying_protection: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_hate_crime_law: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_incitement_prohibition: { so: 'Yes', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_intersex_protection: 'No',
    });
    const p = computeRightsProfile(row);
    expect(p.lgb.verdict).toBe('protected');
    expect(VERDICT_ORDER[p.trans.verdict]).toBeLessThan(VERDICT_ORDER.protected);
    expect(VERDICT_ORDER[p.intersex.verdict]).toBeLessThan(VERDICT_ORDER.protected);
    // The general verdict must follow the worst, not the headline one.
    expect(p.general.verdict).not.toBe('protected');
  });

  it('names what the dataset does not cover, per lens', () => {
    const p = computeRightsProfile(goodRow());
    expect(p.trans.notCovered.join(' ')).toMatch(/identity documents are treated at borders/);
    expect(p.intersex.notCovered.join(' ')).toMatch(/Surgery-deferral/);
  });

  it('says outright that criminalisation data covers same-sex acts, not trans people', () => {
    const row = goodRow({ lgbti_criminalization: { legal: false, death_penalty: 'No' } });
    expect(computeLens(row, 'trans').notCovered.join(' ')).toMatch(
      /Trans-specific criminalisation/,
    );
  });
});

describe('a fully protective country still reads as protected', () => {
  it('does not over-correct into pessimism', () => {
    const p = computeRightsProfile(goodRow());
    expect(p.lgb.verdict).toBe('protected');
    expect(p.trans.verdict).toBe('protected');
    expect(p.intersex.verdict).toBe('protected');
    expect(p.general.verdict).toBe('protected');
    expect(p.asOf).toBe('2026-08-07');
  });
});

/**
 * Two defects found only by running the engine over all 250 live rows. Both
 * passed every invariant test above, so nothing here would have caught them.
 */
describe('regressions found by running against real data', () => {
  it('does not count "No criminalisation" as a negative right', () => {
    // `penalty` describes the sentence, not a right. Its value on a
    // non-criminalising country is the string "No criminalisation", which the
    // unrecognised-string default read as negative — penalising every free
    // country on Earth. It dragged Germany's LGB balance to 11/13 and pushed
    // 14 countries out of `protected` entirely.
    const l = computeLens(
      {
        ...goodRow(),
        lgbti_criminalization: { legal: true, death_penalty: 'No', penalty: 'No criminalisation' },
      },
      'lgb',
    );
    const penalty = l.evidence.find((e) => e.key === 'criminalisation.penalty');
    expect(penalty?.polarity).toBe('absent');
    expect(l.verdict).toBe('protected');
  });

  it('renders the general verdict as a SPLIT, never as one adjective', () => {
    // worstOf is correct, but 228 of 250 countries record intersex protection
    // as "No", so the intersex lens is hostile almost everywhere and swallows
    // the others. Collapsed to one word Germany reads "hostile" — a worse lie
    // than the 100/100 it replaces. The verdict field is for sorting; this
    // string is what a human sees.
    // Germany's real shape: SO protected everywhere, SC nowhere.
    const soOnly = { so: 'Yes', gi: 'Yes', ge: 'Yes', sc: 'No' };
    const p = computeRightsProfile(
      goodRow({
        lgbti_intersex_protection: 'No',
        lgbti_constitutional_protection: soOnly,
        lgbti_employment_protection: soOnly,
        lgbti_housing_protection: soOnly,
        lgbti_education_protection: soOnly,
        lgbti_health_protection: soOnly,
        lgbti_goods_services_protection: soOnly,
        lgbti_bullying_protection: soOnly,
        lgbti_hate_crime_law: soOnly,
        lgbti_incitement_prohibition: soOnly,
      }),
    );
    expect(p.lgb.verdict).toBe('protected');
    expect(p.intersex.verdict).toBe('hostile');
    expect(p.general.headline).toMatch(/Protected for LGB people/);
    expect(p.general.headline).toMatch(/Hostile for intersex people/);
    expect(p.general.headline).toContain('·');
    // And the sortable field follows the worst lens, not the headline one.
    expect(p.general.verdict).toBe('hostile');
  });

  it('says it once when every lens agrees', () => {
    const p = computeRightsProfile(
      goodRow({ lgbti_criminalization: { legal: false, death_penalty: 'Yes' } }),
    );
    expect(p.general.headline).toBe('Criminalised, death penalty for LGBTQ+ people');
  });
});

/**
 * INV-6 — "Varies" is sub-national variation, not a recorded absence.
 *
 * Measured on prod 2026-08-30: the entire live vocabulary of the nine
 * protection blobs is Yes / No / Varies / Unclear / N/A / null. `Varies` is how
 * ILGA records a federation whose states disagree, and it was scored as a
 * negative — arithmetically identical to a recorded "No", because the balance
 * is `positives / measured`.
 *
 * The cost was concentrated on exactly one country. 14 of the 19 negatives in
 * the United States' trans lens were the string "Varies", which is why the US
 * (Bostock, marriage, joint adoption) computed a trans balance of 0.14 against
 * Russia's 0.05 — near enough to publish the same word for both.
 *
 * `absent` rather than a fourth polarity: the type already has a state meaning
 * "recorded, but not a national claim we can make", and it is the same
 * reasoning that leaves `visa_requirements` permanently `data_unavailable`.
 * Coverage is affected deliberately — a country whose required inputs are
 * mostly `Varies` genuinely has no national answer, and INV-2 should say so.
 */
/**
 * INV-7 — bodily autonomy is the keystone intersex right, not 1 vote of 11.
 *
 * The intersex lens reads ten things: nine `sc` anti-discrimination grounds and
 * `lgbti_intersex_protection`, which is ILGA's record of protection from
 * non-consensual medical intervention. Unweighted, that last one carries the
 * same weight as `bullying.sc`, and measured on prod 2026-08-30 the result
 * inverts on the two countries where it matters most:
 *
 *   Denmark   has NOT banned non-consensual intersex surgery, 7 of 9 `sc`
 *             grounds recorded Yes  ->  intersex lens read `protected`
 *   Germany   BANNED it in 2021, 1 of 9 `sc` grounds  ->  read `hostile`
 *
 * So the country that permits the surgery read "broad protections" and the one
 * that outlawed it read "few or no protections". Only 9 countries hold this
 * right at all (Malta, Portugal, Greece, Iceland, Germany, Spain, Chile,
 * Colombia, Kenya), so it can never win on volume against nine grounds almost
 * nobody records.
 *
 * Modelled on INV-5 rather than by inventing weights: a cap and a floor, each
 * stated as a claim we refuse to make.
 *   - permitting it CAPS the lens at `partial` — no accumulation of
 *     anti-discrimination law makes a jurisdiction that still allows
 *     non-consensual surgery "broadly protective" of intersex people
 *   - recording it FLOORS the lens at `partial` — a state that legislated the
 *     keystone right is not "few or no protections"
 *
 * Both act only on a MEASURED value, so a country ILGA has not assessed is
 * untouched, and both sit after the INV-1/INV-2 early returns so
 * criminalisation and thin data still win.
 */
describe('INV-7 — the intersex bodily-autonomy right outranks the sc grounds', () => {
  const scAll = (v: string) => ({ so: 'Yes', gi: 'Yes', ge: 'Yes', sc: v });

  /** Denmark's shape: broad sc cover, no ban on non-consensual surgery. */
  const denmark = () =>
    goodRow({
      lgbti_intersex_protection: 'No',
      lgbti_constitutional_protection: scAll('Yes'),
      lgbti_employment_protection: scAll('Yes'),
      lgbti_housing_protection: scAll('Yes'),
      lgbti_education_protection: scAll('Yes'),
      lgbti_health_protection: scAll('Yes'),
      lgbti_goods_services_protection: scAll('Yes'),
      lgbti_bullying_protection: scAll('Yes'),
      lgbti_hate_crime_law: scAll('Yes'),
      lgbti_incitement_prohibition: scAll('Yes'),
    });

  /** Germany's shape: the 2021 ban, almost no sc anti-discrimination grounds. */
  const germany = () =>
    goodRow({
      lgbti_intersex_protection: 'Yes',
      lgbti_constitutional_protection: scAll('No'),
      lgbti_employment_protection: scAll('No'),
      lgbti_housing_protection: scAll('No'),
      lgbti_education_protection: scAll('No'),
      lgbti_health_protection: scAll('No'),
      lgbti_goods_services_protection: scAll('No'),
      lgbti_bullying_protection: scAll('No'),
      lgbti_hate_crime_law: scAll('Yes'),
      lgbti_incitement_prohibition: scAll('No'),
    });

  it('never reads "broad protections" where the surgery is still permitted', () => {
    expect(computeLens(denmark(), 'intersex').verdict).toBe('partial');
  });

  it('never reads "few or no protections" where the keystone right exists', () => {
    expect(computeLens(germany(), 'intersex').verdict).toBe('partial');
  });

  it('leaves a country holding neither where the balance puts it', () => {
    // Norway: no ban, and no sc grounds either. `hostile` is the true reading
    // and the floor must not rescue it.
    const norway = goodRow({
      lgbti_intersex_protection: 'No',
      lgbti_constitutional_protection: scAll('No'),
      lgbti_employment_protection: scAll('No'),
      lgbti_housing_protection: scAll('No'),
      lgbti_education_protection: scAll('No'),
      lgbti_health_protection: scAll('No'),
      lgbti_goods_services_protection: scAll('No'),
      lgbti_bullying_protection: scAll('No'),
      lgbti_hate_crime_law: scAll('No'),
      lgbti_incitement_prohibition: scAll('No'),
    });
    expect(computeLens(norway, 'intersex').verdict).toBe('hostile');
  });

  it('does not act on an unmeasured value', () => {
    // INV-3: "No data" is not a finding, so neither rule may fire on it.
    const l = computeLens({ ...goodRow(), lgbti_intersex_protection: 'No data' }, 'intersex');
    expect(l.evidence.find((e) => e.key === 'intersex.protection')?.polarity).toBe('absent');
    expect(l.verdict).toBe('protected');
  });

  it('never lifts a criminalising country — INV-1 still wins', () => {
    const row = { ...germany(), lgbti_criminalization: { legal: false, death_penalty: 'No' } };
    expect(computeLens(row, 'intersex').verdict).toBe('criminalized');
  });
});

describe('INV-6 — indeterminate values never count as a recorded negative', () => {
  it('does not read sub-national variation as an absence of protection', () => {
    const l = computeLens({ ...goodRow(), lgbti_housing_protection: protectAll('Varies') }, 'lgb');
    expect(l.evidence.find((e) => e.key === 'housing.so')?.polarity).toBe('absent');
  });

  it('treats "Unclear" the same way', () => {
    const l = computeLens({ ...goodRow(), lgbti_housing_protection: protectAll('Unclear') }, 'lgb');
    expect(l.evidence.find((e) => e.key === 'housing.so')?.polarity).toBe('absent');
  });

  it('still counts a recorded No as a negative', () => {
    // The guard against over-correcting: only indeterminacy is excused.
    const l = computeLens({ ...goodRow(), lgbti_housing_protection: protectAll('No') }, 'lgb');
    expect(l.evidence.find((e) => e.key === 'housing.so')?.polarity).toBe('negative');
  });

  it('does not let indeterminate values drag a protective country down', () => {
    // Six of nine grounds unresolvable nationally, three recorded Yes. The old
    // default made this `hostile`; nothing here is a recorded absence.
    const row = goodRow({
      lgbti_constitutional_protection: protectAll('Varies'),
      lgbti_housing_protection: protectAll('Varies'),
      lgbti_education_protection: protectAll('Varies'),
      lgbti_health_protection: protectAll('Varies'),
      lgbti_goods_services_protection: protectAll('Varies'),
      lgbti_bullying_protection: protectAll('Varies'),
    });
    expect(computeLens(row, 'lgb').verdict).toBe('protected');
  });
});
