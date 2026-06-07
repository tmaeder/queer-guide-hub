import { describe, it, expect } from 'vitest';
import { pickLocalized, localizedField, localizeEntity, normalizeContentLang } from './localizeContent';

describe('normalizeContentLang', () => {
  it('strips region and validates', () => {
    expect(normalizeContentLang('de-DE')).toBe('de');
    expect(normalizeContentLang('DE')).toBe('de');
    expect(normalizeContentLang('xx')).toBe('en'); // unsupported -> default
    expect(normalizeContentLang(undefined)).toBe('en');
  });
});

describe('pickLocalized', () => {
  const map = { de: 'Hallo', fr: 'Bonjour', es: '   ' };
  it('returns the locale value when present', () => {
    expect(pickLocalized(map, 'Hello', 'de')).toBe('Hallo');
    expect(pickLocalized(map, 'Hello', 'fr-FR')).toBe('Bonjour');
  });
  it('falls back to base for default locale, missing, or blank slots', () => {
    expect(pickLocalized(map, 'Hello', 'en')).toBe('Hello');
    expect(pickLocalized(map, 'Hello', 'it')).toBe('Hello'); // missing
    expect(pickLocalized(map, 'Hello', 'es')).toBe('Hello'); // blank -> base
  });
  it('is null-safe', () => {
    expect(pickLocalized(null, 'Hello', 'de')).toBe('Hello');
    expect(pickLocalized(undefined, null, 'de')).toBe('');
    expect(pickLocalized('not-an-object' as unknown as null, 'Hello', 'de')).toBe('Hello');
  });
});

describe('localizedField', () => {
  it('reads the sibling _i18n column', () => {
    const venue = { name: 'The Bar', name_i18n: { de: 'Die Bar' }, description: 'x' };
    expect(localizedField(venue, 'name', 'de')).toBe('Die Bar');
    expect(localizedField(venue, 'name', 'en')).toBe('The Bar');
    expect(localizedField(venue, 'description', 'de')).toBe('x'); // no description_i18n
    expect(localizedField(null, 'name', 'de')).toBe('');
  });
});

describe('localizeEntity', () => {
  it('overwrites only fields with a real translation, clones lazily', () => {
    const e = { id: 1, name: 'The Bar', name_i18n: { de: 'Die Bar' }, title: null };
    const out = localizeEntity(e, ['name', 'title'], 'de');
    expect(out.name).toBe('Die Bar');
    expect(out).not.toBe(e); // cloned
    expect(out.id).toBe(1);
  });
  it('returns the same ref for default locale or no translations', () => {
    const e = { name: 'The Bar', name_i18n: { de: 'Die Bar' } };
    expect(localizeEntity(e, ['name'], 'en')).toBe(e);
    expect(localizeEntity(e, ['name'], 'it')).toBe(e); // no 'it' -> no change
  });
});
