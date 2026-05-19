import { describe, it, expect } from 'vitest';
import { getLegalityBadge } from '../lgbtLegality';

describe('getLegalityBadge', () => {
  it('returns protected for high equality_score', () => {
    const badge = getLegalityBadge({ equality_score: 90 });
    expect(badge?.level).toBe('protected');
    expect(badge?.label).toBe('LGBTQ+ legal');
  });

  it('returns mixed for mid equality_score', () => {
    const badge = getLegalityBadge({ equality_score: 55 });
    expect(badge?.level).toBe('mixed');
    expect(badge?.label).toBe('Mixed protections');
  });

  it('returns restricted for low equality_score', () => {
    const badge = getLegalityBadge({ equality_score: 12 });
    expect(badge?.level).toBe('restricted');
    expect(badge?.label).toBe('Restrictions apply');
  });

  it('returns restricted when criminalization is flagged regardless of score', () => {
    const badge = getLegalityBadge({
      equality_score: 30,
      lgbti_criminalization: { legal: false, penalty: '5 years imprisonment', death_penalty: 'No', max_prison: '5' },
    });
    expect(badge?.level).toBe('restricted');
  });

  it('does NOT flag protected countries with sanitized lgbti_criminalization JSON', () => {
    // Germany shape: legal:true, penalty:"No criminalisation", death_penalty:"No", max_prison:"No"
    const badge = getLegalityBadge({
      equality_score: 100,
      lgbti_criminalization: {
        death_penalty: 'No',
        legal: true,
        max_prison: 'No',
        penalty: 'No criminalisation',
      },
    });
    expect(badge?.level).toBe('protected');
  });

  it('returns restricted when legal status text mentions criminalization', () => {
    const badge = getLegalityBadge({
      equality_score: 25,
      lgbt_legal_status: 'Same-sex relations are criminalized',
    });
    expect(badge?.level).toBe('restricted');
  });

  it('returns null when no LGBTQ+ data is available (no fabrication)', () => {
    expect(getLegalityBadge({})).toBeNull();
    expect(getLegalityBadge(null)).toBeNull();
    expect(getLegalityBadge(undefined)).toBeNull();
  });

  it('includes equality score in ariaLabel for screen readers', () => {
    const badge = getLegalityBadge({ equality_score: 85 });
    expect(badge?.ariaLabel).toContain('85');
  });
});
