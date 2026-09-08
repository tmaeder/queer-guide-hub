import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  EQUALITY_TIERS,
  EQUALITY_TIER_CUTOFFS,
  EQUALITY_TIER_I18N_KEY,
  EQUALITY_TIER_LABEL,
  getScoreLabel,
  getScoreRingColor,
  parseSsuSummary,
  parseSsuDetails,
  isCriminalized,
  hasDeathPenalty,
  deathPenaltyRisk,
  getProtectionStatus,
} from '../equalityScore';

describe('getScoreLabel', () => {
  it('should return No data for null', () => {
    const result = getScoreLabel(null);
    expect(result.label).toBe('No data');
    expect(result.score).toBe(0);
  });

  it('should return No data for undefined', () => {
    expect(getScoreLabel(undefined).label).toBe('No data');
  });

  it('should return Very high for score >= 80', () => {
    expect(getScoreLabel(80).label).toBe('Very high');
    expect(getScoreLabel(100).label).toBe('Very high');
  });

  it('should return High for score 60-79', () => {
    expect(getScoreLabel(60).label).toBe('High');
    expect(getScoreLabel(79).label).toBe('High');
  });

  it('should return Moderate for score 40-59', () => {
    expect(getScoreLabel(40).label).toBe('Moderate');
    expect(getScoreLabel(59).label).toBe('Moderate');
  });

  it('should return Low for score 20-39', () => {
    expect(getScoreLabel(20).label).toBe('Low');
    expect(getScoreLabel(39).label).toBe('Low');
  });

  it('should return Very low for score < 20', () => {
    expect(getScoreLabel(0).label).toBe('Very low');
    expect(getScoreLabel(19).label).toBe('Very low');
  });

  it('should preserve input score in result', () => {
    expect(getScoreLabel(73).score).toBe(73);
  });
});

describe('getScoreRingColor', () => {
  it('should return gray for null/undefined', () => {
    expect(getScoreRingColor(null)).toBe('#d1d5db');
    expect(getScoreRingColor(undefined)).toBe('#d1d5db');
  });

  it('should return green for >= 80', () => {
    expect(getScoreRingColor(80)).toBe('#22c55e');
  });

  it('should return lime for 60-79', () => {
    expect(getScoreRingColor(60)).toBe('#84cc16');
  });

  it('should return yellow for 40-59', () => {
    expect(getScoreRingColor(40)).toBe('#eab308');
  });

  it('should return orange for 20-39', () => {
    expect(getScoreRingColor(20)).toBe('#f97316');
  });

  it('should return red for < 20', () => {
    expect(getScoreRingColor(0)).toBe('#ef4444');
  });
});

describe('parseSsuSummary', () => {
  it('should return No data for null', () => {
    expect(parseSsuSummary(null)).toBe('No data');
  });

  it('should parse JSON and return summary', () => {
    expect(parseSsuSummary('{"summary":"Legal"}')).toBe('Legal');
  });

  it('should return No data when summary missing', () => {
    expect(parseSsuSummary('{}')).toBe('No data');
  });

  it('should return raw string on invalid JSON', () => {
    expect(parseSsuSummary('plain text')).toBe('plain text');
  });
});

describe('parseSsuDetails', () => {
  it('should return defaults for null', () => {
    const result = parseSsuDetails(null);
    expect(result.summary).toBe('No data');
    expect(result.marriage).toBeNull();
  });

  it('should parse full JSON', () => {
    const json = JSON.stringify({
      summary: 'Legal',
      marriage: 'Yes',
      marriage_since: '2001',
      civil_union: 'Yes',
      civil_union_since: '1998',
    });
    const result = parseSsuDetails(json);
    expect(result.summary).toBe('Legal');
    expect(result.marriage).toBe('Yes');
    expect(result.marriage_since).toBe('2001');
  });

  it('should handle invalid JSON by returning raw as summary', () => {
    const result = parseSsuDetails('not json');
    expect(result.summary).toBe('not json');
    expect(result.marriage).toBeNull();
  });
});

describe('isCriminalized', () => {
  it('should return false for null', () => {
    expect(isCriminalized(null)).toBe(false);
  });

  it('should return true when legal is false', () => {
    expect(isCriminalized({ legal: false })).toBe(true);
  });

  it('should return false when legal is true', () => {
    expect(isCriminalized({ legal: true })).toBe(false);
  });

  // Second arm of the DB predicate `location_is_high_risk`. No live row hits
  // it today (all 7 death-penalty countries also carry legal:false), so this
  // guards the parity rather than a current behaviour.
  it('should return true on death_penalty alone when legal is absent', () => {
    expect(isCriminalized({ death_penalty: 'Yes' })).toBe(true);
  });
});

describe('deathPenaltyRisk', () => {
  it('returns none for null or an empty shape', () => {
    expect(deathPenaltyRisk(null)).toBe('none');
    expect(deathPenaltyRisk({})).toBe('none');
  });

  // Nigeria: the flag is set but the penalty prose names only prison, so
  // reading `penalty` alone would miss it.
  it('trusts an explicit death_penalty flag over the penalty prose', () => {
    expect(deathPenaltyRisk({ death_penalty: 'Yes', penalty: '10 years to life in prison' })).toBe(
      'confirmed',
    );
  });

  // Afghanistan, Pakistan, Qatar, Somalia, UAE. ILGA records uncertainty in
  // `death_penalty` and names the penalty in the sibling field. Reading only
  // `death_penalty` returned false here — identical to a country that had
  // been measured and found safe.
  it('reports uncertainty as possible, not as absence', () => {
    expect(
      deathPenaltyRisk({
        death_penalty: 'No legal certainty',
        penalty: 'Death Penalty (possible)',
      }),
    ).toBe('possible');
  });

  it('never reports a measured No as possible', () => {
    expect(deathPenaltyRisk({ death_penalty: 'No', penalty: '10 years in prison' })).toBe('none');
  });
});

describe('hasDeathPenalty', () => {
  it('should return false for null', () => {
    expect(hasDeathPenalty(null)).toBe(false);
  });

  it('should return true when death_penalty includes Death', () => {
    expect(hasDeathPenalty({ death_penalty: 'Death penalty' })).toBe(true);
  });

  it('should return true when death_penalty is Yes', () => {
    expect(hasDeathPenalty({ death_penalty: 'Yes' })).toBe(true);
  });

  it('should return false when death_penalty is No', () => {
    expect(hasDeathPenalty({ death_penalty: 'No' })).toBe(false);
  });

  it('should return false when death_penalty missing', () => {
    expect(hasDeathPenalty({})).toBe(false);
  });
});

describe('getProtectionStatus', () => {
  it('should return No data for all fields when null', () => {
    const result = getProtectionStatus(null);
    expect(result.so).toBe('No data');
    expect(result.gi).toBe('No data');
    expect(result.ge).toBe('No data');
    expect(result.sc).toBe('No data');
  });

  it('should return provided values', () => {
    const result = getProtectionStatus({ so: 'Yes', gi: 'Partial', ge: 'No', sc: 'Yes' });
    expect(result.so).toBe('Yes');
    expect(result.gi).toBe('Partial');
  });

  it('should default missing fields to No data', () => {
    const result = getProtectionStatus({ so: 'Yes' });
    expect(result.gi).toBe('No data');
  });
});

describe('the tier vocabulary is single-sourced', () => {
  /**
   * /cities carried its own copy of the tier→word map until the two were
   * unified. They agreed on five tiers and disagreed on `unknown` ('No Data'
   * against 'No data'), and both rendered — so the same city read differently
   * depending on which surface you were on. These assertions are what stops a
   * second copy, or a half-applied rename, from being invisible again.
   */
  it('both tier maps cover every tier and nothing else', () => {
    expect(Object.keys(EQUALITY_TIER_LABEL).sort()).toEqual([...EQUALITY_TIERS].sort());
    expect(Object.keys(EQUALITY_TIER_I18N_KEY).sort()).toEqual([...EQUALITY_TIERS].sort());
  });

  it('no two tiers share a word', () => {
    // Distinctness is load-bearing beyond tidiness: a shared word makes two
    // tiers indistinguishable in the chip, the filter's accessible name and
    // the aria-label, none of which render anything but the word.
    const labels = Object.values(EQUALITY_TIER_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('getScoreLabel reports the tier it took the label from', () => {
    // The i18n key is now read off `tier`, so a breakdown whose tier and label
    // disagreed would translate to the wrong word with nothing else failing.
    for (const tier of EQUALITY_TIERS) {
      const score =
        tier === 'unknown' ? null : EQUALITY_TIER_CUTOFFS.find((c) => c.tier === tier)!.min;
      const got = getScoreLabel(score);
      expect(got.tier, `getScoreLabel(${score})`).toBe(tier);
      expect(got.label).toBe(EQUALITY_TIER_LABEL[tier]);
    }
  });

  it('every tier resolves to an i18n key that exists in en.json', () => {
    // SafetyVerdict and TripSafetyBriefing both do
    // t(`trips.safety.scoreLabel.${EQUALITY_TIER_I18N_KEY[tier]}`). A key with
    // no entry silently renders the English defaultValue, which looks correct
    // in English and ships untranslated everywhere else.
    for (const file of ['../../i18n/locales/en.json', '../../../public/locales/en.json']) {
      const en = JSON.parse(readFileSync(resolve(__dirname, file), 'utf8')) as {
        trips: { safety: { scoreLabel: Record<string, string> } };
      };
      for (const tier of EQUALITY_TIERS) {
        const key = EQUALITY_TIER_I18N_KEY[tier];
        expect(
          en.trips.safety.scoreLabel[key],
          `${file} is missing scoreLabel.${key}`,
        ).toBeTruthy();
      }
    }
  });

  it('the code fallback and the en.json value are the same word', () => {
    // These labels ARE the defaultValue behind `trips.safety.scoreLabel.*`, so
    // a surface with a translation and a surface without one render the same
    // tier from the same data. They disagreed on `very-high` and `very-low`
    // until this was unified: /cities said "Very High", the trip briefing said
    // "Very high". The other four already matched, which is exactly why nobody
    // spotted it — a partial agreement reads as agreement.
    //
    // en.json only. Other locales are translations and MUST differ.
    for (const file of ['../../i18n/locales/en.json', '../../../public/locales/en.json']) {
      const en = JSON.parse(readFileSync(resolve(__dirname, file), 'utf8')) as {
        trips: { safety: { scoreLabel: Record<string, string> } };
      };
      for (const tier of EQUALITY_TIERS) {
        expect(
          en.trips.safety.scoreLabel[EQUALITY_TIER_I18N_KEY[tier]],
          `${file}: scoreLabel.${EQUALITY_TIER_I18N_KEY[tier]} disagrees with EQUALITY_TIER_LABEL['${tier}']`,
        ).toBe(EQUALITY_TIER_LABEL[tier]);
      }
    }
  });

  it('the two en.json copies agree with each other', () => {
    // src/i18n/locales/en.json is bundled; public/locales/en.json is fetched at
    // runtime. A rename applied to one is invisible in whichever half you did
    // not open — see the same trap in railDeparture.test.ts.
    const read = (f: string) =>
      (
        JSON.parse(readFileSync(resolve(__dirname, f), 'utf8')) as {
          trips: { safety: { scoreLabel: Record<string, string> } };
        }
      ).trips.safety.scoreLabel;
    expect(read('../../i18n/locales/en.json')).toEqual(read('../../../public/locales/en.json'));
  });
});
