import { describe, expect, it } from 'vitest';
import { cityIntroduction } from '../cityIntroduction';

describe('cityIntroduction', () => {
  it('uses a short description once, without an empty lead', () => {
    expect(cityIntroduction('Capital of Germany.', null)).toEqual({
      lead: 'Capital of Germany.',
      showDescription: false,
    });
    expect(cityIntroduction(null, null)).toEqual({ lead: '', showDescription: false });
  });

  it('keeps the full description available behind an editorial hook', () => {
    expect(cityIntroduction('Capital of Germany.', 'A city of many routes.')).toEqual({
      lead: 'A city of many routes.',
      showDescription: true,
    });
  });

  it('preserves later paragraphs in About', () => {
    expect(cityIntroduction('An introduction.\n\nMore local context.', null)).toEqual({
      lead: 'An introduction.',
      showDescription: true,
    });
  });

  it('uses a complete sentence from long single-paragraph copy', () => {
    const description = `An introduction. ${'More local context. '.repeat(30)}`;
    expect(cityIntroduction(description, null)).toEqual({
      lead: 'An introduction.',
      showDescription: true,
    });
  });

  it('bounds unusually long sentences and handles invalid locales', () => {
    const description = 'A long introduction with local context '.repeat(20);
    const result = cityIntroduction(description, null, 'invalid_locale');
    expect(result.lead.length).toBeLessThanOrEqual(261);
    expect(result.lead.endsWith('…')).toBe(true);
    expect(result.showDescription).toBe(true);
  });

  it('segments sentences in languages without spaces', () => {
    const result = cityIntroduction(
      `街の紹介です。${'地域についての詳しい情報です。'.repeat(30)}`,
      null,
      'ja',
    );
    expect(result.lead).toBe('街の紹介です。');
    expect(result.showDescription).toBe(true);
  });
});
