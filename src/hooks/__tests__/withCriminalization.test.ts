import { describe, it, expect } from 'vitest';
import { CRIMINALIZATION_LIST_COLUMNS, withCriminalization } from '../useIntentData';
import { deathPenaltyRisk, isCriminalized } from '@/utils/equalityScore';

describe('withCriminalization', () => {
  it('rebuilds lgbti_criminalization from the crim_* JSON-path columns', () => {
    const [row] = withCriminalization<Record<string, unknown>>([
      {
        id: 'af',
        name: 'Afghanistan',
        crim_legal: false,
        crim_death_penalty: 'No legal certainty',
        crim_penalty: 'Death Penalty (possible)',
        crim_fine: null,
      },
    ]);
    const crim = row.lgbti_criminalization as Record<string, unknown>;
    expect(row).not.toHaveProperty('crim_legal');
    expect(crim).toEqual({
      legal: false,
      death_penalty: 'No legal certainty',
      penalty: 'Death Penalty (possible)',
    });
    expect(isCriminalized(crim)).toBe(true);
    expect(deathPenaltyRisk(crim)).toBe('possible');
  });

  it('keeps an lgbti_criminalization the response already carries', () => {
    const [row] = withCriminalization<Record<string, unknown>>([
      { id: 'de', lgbti_criminalization: { legal: true } },
    ]);
    expect(row.lgbti_criminalization).toEqual({ legal: true });
  });

  it('never selects the enforcement free text', () => {
    expect(CRIMINALIZATION_LIST_COLUMNS).not.toContain('enforcement');
    expect(CRIMINALIZATION_LIST_COLUMNS).toContain('crim_legal:lgbti_criminalization->legal');
  });
});
