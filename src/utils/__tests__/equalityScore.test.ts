import { describe, it, expect } from 'vitest';
import {
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
  it('should return No Data for null', () => {
    const result = getScoreLabel(null);
    expect(result.label).toBe('No Data');
    expect(result.score).toBe(0);
  });

  it('should return No Data for undefined', () => {
    expect(getScoreLabel(undefined).label).toBe('No Data');
  });

  it('should return Very High for score >= 80', () => {
    expect(getScoreLabel(80).label).toBe('Very High');
    expect(getScoreLabel(100).label).toBe('Very High');
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

  it('should return Very Low for score < 20', () => {
    expect(getScoreLabel(0).label).toBe('Very Low');
    expect(getScoreLabel(19).label).toBe('Very Low');
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
    expect(
      deathPenaltyRisk({ death_penalty: 'Yes', penalty: '10 years to life in prison' }),
    ).toBe('confirmed');
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
