import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, RTL_LOCALES, LANGUAGE_NAMES, isSupportedLocale } from '../languages';

describe('languages', () => {
  it('has default locale in supported set', () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
  });
  it('has names for every locale', () => {
    for (const code of SUPPORTED_LOCALES) expect(LANGUAGE_NAMES[code]).toBeTruthy();
  });
  it('isSupportedLocale identifies known and unknown', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('xx')).toBe(false);
  });
  it('RTL list is a subset of supported', () => {
    for (const code of RTL_LOCALES) expect(SUPPORTED_LOCALES).toContain(code);
  });
});
