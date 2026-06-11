import { describe, it, expect } from 'vitest';
import { pronounDisplay } from '@/components/ui/pronoun-combobox';

describe('pronounDisplay', () => {
  it('renders a single set in full', () => {
    expect(pronounDisplay(['they/them'])).toBe('they/them');
  });

  it('joins multiple sets by first segment', () => {
    expect(pronounDisplay(['she/her', 'they/them'])).toBe('she/they');
    expect(pronounDisplay(['he/him', 'she/her', 'they/them'])).toBe('he/she/they');
  });

  it('renders free text verbatim when alone', () => {
    expect(pronounDisplay(['any pronouns'])).toBe('any pronouns');
  });

  it('uses the whole tag as segment when there is no slash', () => {
    expect(pronounDisplay(['she/her', 'ask me'])).toBe('she/ask me');
  });

  it('handles empty input', () => {
    expect(pronounDisplay([])).toBe('');
    expect(pronounDisplay(['  '])).toBe('');
  });
});
