import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from './languages';
// English bundles inline so the most common visitor never blocks on a
// locale fetch. All other locales lazy-load from /locales/<lang>.json
// (served from public/, copied at build time, cached by CF Pages).
import en from './locales/en.json';

const resources = {
  en: { translation: en },
};

// Custom detector: read locale from the first URL path segment
const pathDetector = {
  name: 'path',
  lookup() {
    const segment = window.location.pathname.split('/')[1];
    if (segment && isSupportedLocale(segment)) return segment;
    return undefined;
  },
};

const languageDetector = new LanguageDetector();
languageDetector.addDetector(pathDetector);

i18n
  .use(HttpBackend)
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    // English is bundled inline; other locales come from the http backend.
    resources,
    // Tell i18next that `resources` is only a partial bundle (just en) —
    // missing languages should still go through the backend. Without this,
    // i18next assumes resources covers everything and never calls backend.
    partialBundledLanguages: true,
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    load: 'languageOnly', // 'fr-FR' → load 'fr'
    debug: process.env.NODE_ENV === 'development',

    backend: {
      // CF Pages serves these from /public at long-cache TTLs.
      loadPath: '/locales/{{lng}}.json',
    },

    // English bundles inline so the common case still inits synchronously
    // and avoids the t()-returns-key flash. Non-English locales arrive
    // via the backend; main.tsx awaits loadLanguages() before render so
    // those visitors don't see English content briefly.
    initImmediate: false,

    interpolation: {
      escapeValue: false,
    },

    detection: {
      order: ['path', 'localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },

    react: {
      useSuspense: false,
    },
  });


// WCAG 3.1.1 / 3.1.2 — keep <html lang> + dir in sync with the active locale
// so screen readers pronounce content correctly and Arabic switches to RTL.
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);
function syncHtmlLangDir(lang: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const base = lang.split('-')[0];
  if (root.getAttribute('lang') !== lang) root.setAttribute('lang', lang);
  const dir = RTL_LOCALES.has(base) ? 'rtl' : 'ltr';
  if (root.getAttribute('dir') !== dir) root.setAttribute('dir', dir);
}
syncHtmlLangDir(i18n.language || DEFAULT_LOCALE);
i18n.on('languageChanged', syncHtmlLangDir);

export default i18n;