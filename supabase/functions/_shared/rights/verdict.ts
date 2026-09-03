import type {
  CountryLegalRow,
  Evidence,
  LensVerdict,
  Polarity,
  RightsLens,
  RightsProfile,
  Verdict,
} from './types.ts';
import { VERDICT_ORDER } from './types.ts';
import {
  affirmationPolarity,
  markerPolarity,
  requirementPolarity,
} from './ilgaVocabulary.ts';

/**
 * Categorical rights verdicts, per identity lens, from the ILGA columns.
 *
 * Five invariants hold by construction and are pinned by tests. They are the
 * reason this exists as a type rather than as a re-weighted number:
 *
 *   INV-1  criminalisation ⇒ every lens is criminalized|criminalized-severe.
 *          No accumulation of protections can lift it.
 *   INV-2  coverage < 0.5 with no criminalisation signal ⇒ unknown.
 *          `unknown` never upgrades to `partial`.
 *   INV-3  `absent` never contributes as `positive`.
 *   INV-4  worstOf over any set containing unknown returns at most `partial`.
 *   INV-5  a sterilisation requirement caps the trans verdict at `hostile`.
 *
 * INV-5 was dead code from the day it was written until 2026-09-01. It tests
 * for polarity `negative` on `lgr.requires_surgery`, but the polarity was
 * derived with `/^yes$/i` while ILGA writes "Required" — so it matched nothing,
 * on any country, ever. The vocabulary now has one reader
 * (./ilgaVocabulary.ts); with it INV-5 fires on the four countries whose other
 * protections had been lifting them above `hostile`: Montenegro (equality 99),
 * Bosnia and Herzegovina (92), Mongolia (89) and India (77). The other eleven
 * `Required` countries were already at or below `hostile` for other reasons.
 */

const PROTECTION_COLUMNS = [
  ['constitutional', 'lgbti_constitutional_protection'],
  ['employment', 'lgbti_employment_protection'],
  ['housing', 'lgbti_housing_protection'],
  ['education', 'lgbti_education_protection'],
  ['health', 'lgbti_health_protection'],
  ['goodsServices', 'lgbti_goods_services_protection'],
  ['bullying', 'lgbti_bullying_protection'],
] as const;

const JUSTICE_COLUMNS = [
  ['hateCrime', 'lgbti_hate_crime_law'],
  ['incitement', 'lgbti_incitement_prohibition'],
] as const;

/** ILGA records these as text; anything not listed is treated as absent. */
const YES = /^yes$/i;
const NO = /^no$/i;

function polarityOf(raw: unknown): Polarity {
  const v = raw == null ? '' : String(raw).trim();
  if (!v || /^(no data|unknown|n\/a)$/i.test(v)) return 'absent';
  if (YES.test(v)) return 'positive';
  if (NO.test(v)) return 'negative';
  // 'Varies', 'Unclear' and similar are measured but indeterminate. Counted
  // as present for coverage, never as a protection.
  return 'negative';
}

function ev(
  key: string,
  column: string,
  raw: unknown,
  since?: unknown,
): Evidence {
  return {
    key,
    column,
    polarity: polarityOf(raw),
    value: raw == null ? null : String(raw),
    since: since == null ? null : String(since),
  };
}

/** Parses `lgbti_same_sex_unions`, a JSON string in a text column. */
function parseSsu(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return { summary: String(raw) };
  }
}

/**
 * Criminalisation, read once and shared by every lens.
 *
 * Mirrors `deathPenaltyRisk` in src/utils/equalityScore.ts: ILGA splits the
 * capital-penalty fact across `death_penalty` and `penalty`, and neither is
 * sufficient alone. Nigeria flags 'Yes' while its penalty names only prison;
 * Afghanistan, Pakistan, Qatar, Somalia and the UAE record
 * 'No legal certainty' while naming the death penalty in `penalty`.
 */
function readCriminalisation(row: CountryLegalRow): {
  criminalised: boolean;
  capital: boolean;
  evidence: Evidence[];
} {
  const crim = row.lgbti_criminalization ?? {};
  const dp = String(crim.death_penalty ?? '').trim();
  const penalty = String(crim.penalty ?? '').trim();

  const capital =
    YES.test(dp) ||
    /death/i.test(dp) ||
    /no legal certainty/i.test(dp) ||
    /death/i.test(penalty);

  const criminalised = crim.legal === false || YES.test(dp);

  return {
    criminalised,
    capital,
    evidence: [
      {
        key: 'criminalisation.legal',
        column: 'lgbti_criminalization',
        polarity: crim.legal === true ? 'positive' : crim.legal === false ? 'negative' : 'absent',
        value: crim.legal == null ? null : crim.legal ? 'Legal' : 'Criminalised',
        since: crim.decrim_year_1 == null ? null : String(crim.decrim_year_1),
      },
      // `penalty` describes the sentence, so it is NOT a separate right and
      // must stay out of the balance. It read as a negative on every
      // non-criminalising country, because its value there is the string
      // "No criminalisation" — which means the opposite — and the default for
      // an unrecognised string is negative. Kept as absent-polarity context so
      // the UI can still show it; when a country IS criminalised, INV-1
      // short-circuits before the balance is consulted at all.
      ...(penalty
        ? [
            {
              key: 'criminalisation.penalty',
              column: 'lgbti_criminalization',
              polarity: 'absent' as Polarity,
              value: penalty,
              since: null,
            },
          ]
        : []),
    ],
  };
}

/** Which attribute columns each lens reads out of the protection matrix. */
const LENS_ATTRS: Record<Exclude<RightsLens, 'general'>, readonly string[]> = {
  lgb: ['so'],
  trans: ['gi', 'ge'],
  intersex: ['sc'],
};

/**
 * Inputs that must carry a value for a lens to be considered measured.
 * Missing more than half of them yields `unknown` rather than a guess.
 */
const REQUIRED: Record<Exclude<RightsLens, 'general'>, readonly string[]> = {
  lgb: ['criminalisation.legal', 'unions.summary', 'employment.so', 'hateCrime.so'],
  trans: ['lgr.gender_marker', 'employment.gi', 'employment.ge', 'hateCrime.gi'],
  intersex: ['intersex.protection', 'employment.sc', 'hateCrime.sc'],
};

/**
 * What ILGA does not record. Rendered verbatim by the UI — a lens that looks
 * green must still say what it never looked at.
 */
const NOT_COVERED: Record<Exclude<RightsLens, 'general'>, readonly string[]> = {
  lgb: ['Enforcement in practice', 'Policing and entrapment', 'Sub-national variation'],
  trans: [
    'Bathroom and facility access',
    'How identity documents are treated at borders',
    'Access to gender-affirming healthcare',
    'Youth healthcare restrictions',
    'Sport participation rules',
  ],
  intersex: [
    'Surgery-deferral statutes',
    'Informed-consent age',
    'Intersex-inclusive marker options',
  ],
};

function lensEvidence(row: CountryLegalRow, lens: Exclude<RightsLens, 'general'>): Evidence[] {
  const attrs = LENS_ATTRS[lens];
  const out: Evidence[] = [];

  for (const [name, column] of [...PROTECTION_COLUMNS, ...JUSTICE_COLUMNS]) {
    const blob = row[column] ?? {};
    for (const attr of attrs) {
      out.push(ev(`${name}.${attr}`, column, blob[attr], blob[`${attr}_since`]));
    }
  }

  if (lens === 'lgb') {
    const ssu = parseSsu(row.lgbti_same_sex_unions);
    const summary = String(ssu.summary ?? '');
    out.push({
      key: 'unions.summary',
      column: 'lgbti_same_sex_unions',
      polarity: /marriage|civil union/i.test(summary)
        ? 'positive'
        : summary && !/^no data$/i.test(summary)
          ? 'negative'
          : 'absent',
      value: summary || null,
      since: (ssu.marriage_since as string) ?? null,
    });
    const ado = String(row.lgbti_adoption_rights ?? '');
    out.push({
      key: 'adoption',
      column: 'lgbti_adoption_rights',
      polarity: /joint|second parent/i.test(ado)
        ? 'positive'
        : ado && !/^no data$/i.test(ado)
          ? 'negative'
          : 'absent',
      value: ado || null,
    });
  }

  if (lens === 'trans') {
    const lgr = row.lgbti_gender_recognition ?? {};
    const marker = String(lgr.gender_marker ?? '');
    out.push({
      key: 'lgr.gender_marker',
      column: 'lgbti_gender_recognition',
      // Behaviour-identical to the ternary this replaces. `lgr.gender_marker`
      // is in REQUIRED.trans, so its absent-ness feeds coverageOf and INV-2 —
      // do not retune it while removing a duplicate.
      polarity: markerPolarity(marker),
      value: marker || null,
    });
    const selfId = String(lgr.self_id ?? '');
    out.push({
      key: 'lgr.self_id',
      column: 'lgbti_gender_recognition',
      polarity: affirmationPolarity(selfId),
      value: selfId || null,
      since: (lgr.self_id_since as string) ?? null,
    });
    // Inverted: requiring surgery or a diagnosis is a harm, not a protection.
    // The scalar scored both at zero. See ilgaVocabulary.ts for why "N/A",
    // "Unclear" and "Varies" resolve to `absent` here and not to `negative`
    // as polarityOf would have them — on a harm column, `negative` is an
    // accusation, and it would falsely cap ten countries including Australia.
    for (const [key, raw] of [
      ['lgr.requires_surgery', lgr.requires_surgery],
      ['lgr.requires_diagnosis', lgr.requires_diagnosis],
    ] as const) {
      const v = String(raw ?? '');
      out.push({
        key,
        column: 'lgbti_gender_recognition',
        polarity: requirementPolarity(v),
        value: v || null,
      });
    }
    const ct = String(row.lgbti_conversion_therapy_regulation ?? '');
    out.push({
      key: 'conversionTherapy',
      column: 'lgbti_conversion_therapy_regulation',
      polarity: /^banned$/i.test(ct)
        ? 'positive'
        : ct && !/^no data$/i.test(ct)
          ? 'negative'
          : 'absent',
      value: ct || null,
    });
  }

  if (lens === 'intersex') {
    out.push(ev('intersex.protection', 'lgbti_intersex_protection', row.lgbti_intersex_protection));
  }

  return out;
}

function coverageOf(evidence: Evidence[], required: readonly string[]): number {
  if (required.length === 0) return 1;
  const present = required.filter((key) => {
    const hit = evidence.find((e) => e.key === key);
    return hit != null && hit.polarity !== 'absent';
  });
  return present.length / required.length;
}

function headlineFor(lens: RightsLens, verdict: Verdict, pos: number, total: number): string {
  if (verdict === 'unknown') return '';
  const who =
    lens === 'lgb'
      ? 'lesbian, gay and bisexual people'
      : lens === 'trans'
        ? 'trans people'
        : lens === 'intersex'
          ? 'intersex people'
          : 'LGBTQ+ people';
  const state: Record<Exclude<Verdict, 'unknown'>, string> = {
    'criminalized-severe': `Same-sex acts are criminalised and the penalty can be death`,
    criminalized: `Same-sex acts are criminalised`,
    hostile: `Few or no recorded protections for ${who}`,
    partial: `Some recorded protections for ${who}`,
    protected: `Broad recorded protections for ${who}`,
  };
  const base = state[verdict as Exclude<Verdict, 'unknown'>];
  return total > 0 ? `${base} (${pos} of ${total} recorded rights)` : base;
}

export function computeLens(
  row: CountryLegalRow,
  lens: Exclude<RightsLens, 'general'>,
): LensVerdict {
  const crim = readCriminalisation(row);
  const evidence = [...crim.evidence, ...lensEvidence(row, lens)];
  const coverage = coverageOf(evidence, REQUIRED[lens]);
  const notCovered = NOT_COVERED[lens];

  // Only evidence that is actually recorded participates in the balance.
  const measured = evidence.filter((e) => e.polarity !== 'absent');
  const pos = measured.filter((e) => e.polarity === 'positive').length;

  // INV-1: criminalisation dominates every lens, unconditionally.
  if (crim.criminalised || crim.capital) {
    const verdict: Verdict = crim.capital ? 'criminalized-severe' : 'criminalized';
    return {
      lens,
      verdict,
      coverage,
      evidence,
      notCovered:
        lens === 'trans'
          ? [
              // Disclosed inference, not a hidden weight: ILGA codes
              // criminalisation of consensual same-sex ACTS. Trans-specific
              // criminalisation is not in this dataset, and these statutes are
              // in practice enforced against trans women via public-order and
              // "impersonation" law.
              'Trans-specific criminalisation (this statute covers same-sex acts)',
              ...notCovered,
            ]
          : notCovered,
      headline: headlineFor(lens, verdict, pos, measured.length),
    };
  }

  // INV-2: too little measured to say anything. Never upgrades to partial.
  if (coverage < 0.5) {
    return { lens, verdict: 'unknown', coverage, evidence, notCovered, headline: '' };
  }

  const ratio = measured.length === 0 ? 0 : pos / measured.length;
  let verdict: Verdict = ratio >= 0.7 ? 'protected' : ratio >= 0.35 ? 'partial' : 'hostile';

  // INV-5: a sterilisation requirement is a legal harm no amount of
  // anti-discrimination coverage offsets.
  if (lens === 'trans') {
    const surgery = evidence.find((e) => e.key === 'lgr.requires_surgery');
    if (surgery?.polarity === 'negative' && VERDICT_ORDER[verdict] > VERDICT_ORDER.hostile) {
      verdict = 'hostile';
    }
  }

  return {
    lens,
    verdict,
    coverage,
    evidence,
    notCovered,
    headline: headlineFor(lens, verdict, pos, measured.length),
  };
}

const LENS_NOUN: Record<RightsLens, string> = {
  general: 'LGBTQ+ people',
  lgb: 'LGB people',
  trans: 'trans people',
  intersex: 'intersex people',
};

const VERDICT_WORD: Record<Verdict, string> = {
  'criminalized-severe': 'Criminalised, death penalty',
  criminalized: 'Criminalised',
  hostile: 'Hostile',
  partial: 'Partial',
  protected: 'Protected',
  unknown: 'Not enough data',
};

/**
 * The split, e.g. "Protected for LGB people · Partial for trans people ·
 * Hostile for intersex people".
 *
 * This is the ONLY honest headline for the general verdict, and running the
 * engine over all 250 countries is what proved it. `worstOf` is correct — an
 * average hides the person most at risk — but 228 countries record intersex
 * protection as "No", so the intersex lens is `hostile` almost everywhere and
 * swallows every other lens. Collapsed to one word, Germany and Brazil both
 * read "hostile", which is a worse lie than the 100/100 it replaces.
 *
 * So `general.verdict` is for SORTING AND FILTERING ONLY. Never render it as
 * a single adjective; render this.
 */
function splitHeadline(verdicts: readonly LensVerdict[]): string {
  const lenses = verdicts.filter((v) => v.lens !== 'general');
  if (lenses.length === 0) return '';

  // When every lens agrees there is no split to show, and repeating
  // "Criminalised, death penalty" three times reads as a stutter rather than
  // as emphasis.
  const distinct = new Set(lenses.map((v) => v.verdict));
  if (distinct.size === 1) {
    return `${VERDICT_WORD[lenses[0].verdict]} for LGBTQ+ people`;
  }

  return lenses.map((v) => `${VERDICT_WORD[v.verdict]} for ${LENS_NOUN[v.lens]}`).join(' · ');
}

/**
 * The worst verdict in the set, carrying its evidence.
 *
 * Averaging is precisely the operation that hides the person most at risk, so
 * the general verdict is a minimum, not a mean. INV-4: any `unknown` member
 * caps the result at `partial` — we cannot claim broad protection while an
 * entire identity's data is missing.
 */
export function worstOf(verdicts: readonly LensVerdict[]): LensVerdict {
  const usable = verdicts.filter((v) => v.verdict !== 'unknown');
  const unknowns = verdicts.filter((v) => v.verdict === 'unknown');

  if (usable.length === 0) {
    const first = verdicts[0];
    return {
      ...(first ?? { coverage: 0, evidence: [], notCovered: [] as readonly string[] }),
      lens: 'general',
      verdict: 'unknown',
      headline: '',
    } as LensVerdict;
  }

  let worst = usable[0];
  for (const v of usable) if (VERDICT_ORDER[v.verdict] < VERDICT_ORDER[worst.verdict]) worst = v;

  let verdict = worst.verdict;
  if (unknowns.length > 0 && VERDICT_ORDER[verdict] > VERDICT_ORDER.partial) verdict = 'partial';

  return {
    lens: 'general',
    verdict,
    coverage: Math.min(...verdicts.map((v) => v.coverage)),
    evidence: worst.evidence,
    notCovered: [...new Set(verdicts.flatMap((v) => v.notCovered))],
    // The split, never the worst lens's own sentence — see splitHeadline.
    headline: splitHeadline(verdicts),
  };
}

export function computeRightsProfile(row: CountryLegalRow): RightsProfile {
  const lgb = computeLens(row, 'lgb');
  const trans = computeLens(row, 'trans');
  const intersex = computeLens(row, 'intersex');
  return {
    lgb,
    trans,
    intersex,
    general: worstOf([lgb, trans, intersex]),
    asOf: row.lgbti_data_last_updated == null ? null : String(row.lgbti_data_last_updated),
  };
}

/** Narrow tuple persisted on `countries`. Evidence is recomputed client-side. */
export function toStoredVerdicts(profile: RightsProfile): Record<string, { v: Verdict; cov: number }> {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    general: { v: profile.general.verdict, cov: round(profile.general.coverage) },
    lgb: { v: profile.lgb.verdict, cov: round(profile.lgb.coverage) },
    trans: { v: profile.trans.verdict, cov: round(profile.trans.coverage) },
    intersex: { v: profile.intersex.verdict, cov: round(profile.intersex.coverage) },
  };
}
