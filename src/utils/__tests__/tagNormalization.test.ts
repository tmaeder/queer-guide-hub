import { describe, it, expect } from 'vitest';
import { normalizeTagName } from '../tagNormalization';

describe('normalizeTagName', () => {
  it('returns empty for empty/whitespace input', () => {
    expect(normalizeTagName('')).toBe('');
    expect(normalizeTagName('   ')).toBe('');
  });

  it('title-cases a lowercase word', () => {
    expect(normalizeTagName('abrosexual')).toBe('Abrosexual');
  });

  it('title-cases multi-word lowercase', () => {
    expect(normalizeTagName('queer space party')).toBe('Queer Space Party');
  });

  it('preserves all-caps acronyms inside mixed input', () => {
    expect(normalizeTagName('queer POC space')).toBe('Queer POC Space');
  });

  it('preserves acronym with trailing symbol', () => {
    expect(normalizeTagName('lgbtq+ youth')).toBe('LGBTQ+ Youth');
    expect(normalizeTagName('LGBTQ+ youth')).toBe('LGBTQ+ Youth');
  });

  it('lowercases mixed-case non-acronym words', () => {
    expect(normalizeTagName('aBrOsExUaL')).toBe('Abrosexual');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeTagName('  queer   space  ')).toBe('Queer Space');
  });

  it('capitalizes each hyphen-separated segment', () => {
    expect(normalizeTagName('non-binary')).toBe('Non-Binary');
  });

  it('keeps digits intact', () => {
    expect(normalizeTagName('club 21+')).toBe('Club 21+');
  });

  it('handles leading punctuation', () => {
    expect(normalizeTagName('(test)')).toBe('(Test)');
  });

  it('preserves single-letter words as uppercase', () => {
    expect(normalizeTagName('a b c')).toBe('A B C');
  });

  it('umlauts capitalize correctly', () => {
    expect(normalizeTagName('öffentlich')).toBe('Öffentlich');
  });

  it('capitalizes after slash separator', () => {
    expect(normalizeTagName('Sister/brother roleplay')).toBe('Sister/Brother Roleplay');
  });

  it('lowercases segment between known acronyms in mixed token', () => {
    expect(normalizeTagName('LGBTQ+ cruises/cultural heritage')).toBe(
      'LGBTQ+ Cruises/Cultural Heritage',
    );
  });

  it('keeps apostrophe contractions as one word', () => {
    expect(normalizeTagName("it's complicated")).toBe("It's Complicated");
    expect(normalizeTagName("ma'am")).toBe("Ma'am");
  });
});
