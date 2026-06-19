import { describe, it, expect } from 'vitest';
import { formatNewsTag } from '../newsTags';

describe('formatNewsTag', () => {
  it('title-cases simple slugs', () => {
    expect(formatNewsTag('same-sex-marriage')).toBe('Same-Sex Marriage');
    expect(formatNewsTag('coming-out')).toBe('Coming Out');
    expect(formatNewsTag('russia')).toBe('Russia');
  });

  it('preserves acronym casing', () => {
    expect(formatNewsTag('lgbtqia+')).toBe('LGBTQIA+');
    expect(formatNewsTag('lgbtqia-rights')).toBe('LGBTQIA Rights');
    expect(formatNewsTag('trans-rights')).toBe('Trans Rights');
    expect(formatNewsTag('nba')).toBe('NBA');
    expect(formatNewsTag('us-politics')).toBe('US Politics');
  });

  it('applies whole-slug overrides', () => {
    expect(formatNewsTag('hiv-aids')).toBe('HIV/AIDS');
    expect(formatNewsTag('rupauls-drag-race')).toBe("RuPaul's Drag Race");
  });

  it('handles empty / whitespace input', () => {
    expect(formatNewsTag('')).toBe('');
    expect(formatNewsTag('  ')).toBe('');
  });

  it('is case-insensitive on input', () => {
    expect(formatNewsTag('Same-Sex-Marriage')).toBe('Same-Sex Marriage');
  });
});
