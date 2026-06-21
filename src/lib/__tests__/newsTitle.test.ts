import { describe, it, expect } from 'vitest';
import { localizedNewsTitle } from '@/lib/newsTitle';

describe('localizedNewsTitle', () => {
  const article = {
    title: 'Original English Title',
    title_i18n: { en: 'English Title', de: 'Deutscher Titel', es: 'Título español' },
  };

  it('returns the requested locale translation when present', () => {
    expect(localizedNewsTitle(article, 'de')).toBe('Deutscher Titel');
    expect(localizedNewsTitle(article, 'es')).toBe('Título español');
  });

  it('normalizes region-tagged locales (de-DE -> de)', () => {
    expect(localizedNewsTitle(article, 'de-DE')).toBe('Deutscher Titel');
  });

  it('falls back to the English translation when the locale is missing', () => {
    expect(localizedNewsTitle(article, 'fr')).toBe('English Title');
  });

  it('falls back to the original title when no i18n map exists', () => {
    expect(localizedNewsTitle({ title: 'Raw Title' }, 'de')).toBe('Raw Title');
    expect(localizedNewsTitle({ title: 'Raw Title', title_i18n: null }, 'de')).toBe('Raw Title');
  });

  it('falls back to the original title when the map has no en and no locale match', () => {
    expect(localizedNewsTitle({ title: 'Raw', title_i18n: { it: 'Titolo' } }, 'fr')).toBe('Raw');
  });

  it('ignores empty-string translations', () => {
    expect(localizedNewsTitle({ title: 'Raw', title_i18n: { de: '  ', en: 'Eng' } }, 'de')).toBe('Eng');
  });

  it('handles null/undefined article', () => {
    expect(localizedNewsTitle(null, 'en')).toBe('');
    expect(localizedNewsTitle(undefined, 'en')).toBe('');
  });
});
