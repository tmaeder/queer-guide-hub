import { describe, it, expect } from 'vitest';
import {
  localizedField,
  localizeEntity,
  contentLocaleKey,
  hasTranslation,
} from '../localizeContent';

describe('contentLocaleKey', () => {
  it('reduces a region tag to the key the pipeline writes', () => {
    // i18next hands back de-CH / pt_BR; the *_i18n columns are keyed de / pt.
    expect(contentLocaleKey('de-CH')).toBe('de');
    expect(contentLocaleKey('pt_BR')).toBe('pt');
    expect(contentLocaleKey('JA')).toBe('ja');
  });

  it('treats absence as English', () => {
    expect(contentLocaleKey(null)).toBe('en');
    expect(contentLocaleKey(undefined)).toBe('en');
    expect(contentLocaleKey('')).toBe('en');
  });
});

describe('localizedField', () => {
  const map = { de: 'Regenbogenbar', ja: 'レインボーバー' };

  it('returns the requested locale', () => {
    expect(localizedField('Rainbow Bar', map, 'de')).toBe('Regenbogenbar');
    expect(localizedField('Rainbow Bar', map, 'ja')).toBe('レインボーバー');
  });

  it('falls back to the base column when the locale is absent', () => {
    expect(localizedField('Rainbow Bar', map, 'ko')).toBe('Rainbow Bar');
  });

  it("prefers the map's own en over the base column", () => {
    // Not cosmetic: marketplace-translate parks the German ORIGINAL in
    // title_i18n.de and promotes the English into `title`, so the two can
    // legitimately differ. This mirrors the *_localized_* SQL RPCs.
    expect(localizedField('base', { en: 'from map' }, 'en')).toBe('from map');
    expect(localizedField('base', { en: 'from map' }, 'ko')).toBe('from map');
  });

  it('treats a blank translation as absence, not as content', () => {
    // The batch writer has produced empty strings when a model returned
    // nothing usable. Rendering one blanks the field instead of falling back.
    expect(localizedField('Rainbow Bar', { de: '   ' }, 'de')).toBe('Rainbow Bar');
    expect(localizedField('Rainbow Bar', { de: '' }, 'de')).toBe('Rainbow Bar');
  });

  it('survives a malformed column', () => {
    expect(localizedField('Rainbow Bar', null, 'de')).toBe('Rainbow Bar');
    expect(localizedField('Rainbow Bar', undefined, 'de')).toBe('Rainbow Bar');
    // jsonb columns have carried arrays and scalars through bad writes before.
    expect(localizedField('Rainbow Bar', [] as unknown as Record<string, string>, 'de')).toBe(
      'Rainbow Bar',
    );
    expect(
      localizedField('Rainbow Bar', { de: 42 } as unknown as Record<string, string>, 'de'),
    ).toBe('Rainbow Bar');
  });

  it('never returns null or undefined', () => {
    expect(localizedField(null, null, 'de')).toBe('');
    expect(localizedField(undefined, undefined, null)).toBe('');
  });
});

describe('localizeEntity', () => {
  const venue = {
    id: 'v1',
    name: 'Rainbow Bar',
    description: 'A bar.',
    name_i18n: { de: 'Regenbogenbar' },
    description_i18n: { de: 'Eine Bar.' },
    category: 'bar',
  };

  it('replaces the base columns it was asked for and nothing else', () => {
    const out = localizeEntity(venue, ['name', 'description'], 'de')!;
    expect(out.name).toBe('Regenbogenbar');
    expect(out.description).toBe('Eine Bar.');
    expect(out.category).toBe('bar');
    expect(out.id).toBe('v1');
  });

  it('does not mutate the input row', () => {
    localizeEntity(venue, ['name'], 'de');
    expect(venue.name).toBe('Rainbow Bar');
  });

  it('leaves a field alone when its map is missing', () => {
    const out = localizeEntity({ name: 'X', name_i18n: null }, ['name'], 'de')!;
    expect(out.name).toBe('X');
  });

  it('honours an explicit column mapping', () => {
    // news_articles.description_i18n is fed from `excerpt`, not from a
    // `description` column. Assuming the convention here returns the base
    // value forever and looks like "the pipeline produced nothing".
    const article = { excerpt: 'Short.', description_i18n: { de: 'Kurz.' } };
    const out = localizeEntity(article, ['excerpt'], 'de', () => 'description_i18n')!;
    expect(out.excerpt).toBe('Kurz.');
  });

  it('passes null and undefined through', () => {
    expect(localizeEntity(null, ['name'], 'de')).toBeNull();
    expect(localizeEntity(undefined, ['name'], 'de')).toBeUndefined();
  });
});

describe('hasTranslation', () => {
  it('is about presence, not about differing from English', () => {
    // A translation may legitimately equal the source (proper nouns, "OK").
    expect(hasTranslation({ de: 'Berlin' }, 'de')).toBe(true);
    expect(hasTranslation({ de: '  ' }, 'de')).toBe(false);
    expect(hasTranslation(null, 'de')).toBe(false);
    expect(hasTranslation({ de: 'x' }, 'fr')).toBe(false);
  });
});
