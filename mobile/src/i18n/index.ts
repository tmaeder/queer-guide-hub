import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import en from './en.json';

export const resources = { en: { translation: en }, de: { translation: de } } as const;
export const SUPPORTED = Object.keys(resources) as Array<keyof typeof resources>;

/** First device language we ship a catalog for; English otherwise. */
export function pickLanguage(deviceLanguages: Array<string | null | undefined>): keyof typeof resources {
  for (const code of deviceLanguages) {
    const base = code?.toLowerCase().split('-')[0];
    if (base && (SUPPORTED as string[]).includes(base)) return base as keyof typeof resources;
  }
  return 'en';
}

/** ISO 3166 region of the device (e.g. "CH"), used to pick local support lines. */
export function deviceRegion(): string | null {
  return getLocales()[0]?.regionCode ?? null;
}

i18n.use(initReactI18next).init({
  resources,
  lng: pickLanguage(getLocales().map((l) => l.languageCode)),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
