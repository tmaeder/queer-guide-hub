import i18n, { type BackendModule, type LanguageDetectorModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from './languages';
import { isRtlLocale } from '@/lib/locale';
// English bundles inline so the most common visitor never blocks on a
// locale fetch. All other locales lazy-load from /locales/<lang>.json
// (served from public/, copied at build time, cached by CF Pages).
import en from './locales/en.json';

const resources = {
  en: { translation: en },
};

const STORAGE_KEY = 'i18nextLng';

// Order: URL path segment, saved choice, browser, <html lang>. i18next picks
// the first supported entry (load: 'languageOnly' maps 'fr-FR' to 'fr').
export const languageDetector: LanguageDetectorModule = {
  type: 'languageDetector',
  detect() {
    const segment = window.location.pathname.split('/')[1];
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    const candidates = [
      segment && isSupportedLocale(segment) ? segment : undefined,
      saved,
      ...(navigator.languages ?? [navigator.language]),
      document.documentElement.lang,
    ];
    return candidates.filter((c): c is string => !!c);
  },
  cacheUserLanguage(lng) {
    try {
      localStorage.setItem(STORAGE_KEY, lng);
    } catch {
      /* storage blocked */
    }
  },
};

// CF Pages serves /locales/*.json from /public at long-cache TTLs.
// The second callback arg tells i18next whether a retry is worthwhile.
export const localeBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(lng, _ns, callback) {
    fetch(`/locales/${lng}.json`)
      .then(async (res) => {
        if (!res.ok)
          return callback(new Error(`locale ${lng}: HTTP ${res.status}`), res.status >= 500);
        callback(null, await res.json());
      })
      .catch((err) => callback(err, true));
  },
};

i18n
  .use(localeBackend)
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

    // English bundles inline so the common case still inits synchronously
    // and avoids the t()-returns-key flash. Non-English locales arrive
    // via the backend; main.tsx awaits loadLanguages() before render so
    // those visitors don't see English content briefly.
    initImmediate: false,

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: false,
    },
  });

// WCAG 3.1.1 / 3.1.2 — keep <html lang> + dir in sync with the active locale
// so screen readers pronounce content correctly and Arabic switches to RTL.
// `isRtlLocale` is shared with every component that mirrors its own layout,
// so a self-mirroring surface can never disagree with the attribute here.
function syncHtmlLangDir(lang: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.getAttribute('lang') !== lang) root.setAttribute('lang', lang);
  const dir = isRtlLocale(lang) ? 'rtl' : 'ltr';
  if (root.getAttribute('dir') !== dir) root.setAttribute('dir', dir);
}
syncHtmlLangDir(i18n.language || DEFAULT_LOCALE);
i18n.on('languageChanged', syncHtmlLangDir);

export default i18n;
