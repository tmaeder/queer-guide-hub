import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from './languages';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ar from './locales/ar.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  it: { translation: it },
  ru: { translation: ru },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko },
  ar: { translation: ar },
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
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    debug: process.env.NODE_ENV === 'development',

    // Resources are bundled synchronously above, so init can run sync too.
    // Default `initImmediate: true` defers init via setTimeout, leaving a
    // microtask window where `t()` returns raw keys — which showed up as
    // flashes in dialogs that mounted during that window.
    initImmediate: false,

    interpolation: {
      escapeValue: false,
    },

    detection: {
      order: ['path', 'localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },

    // Keep `useTranslation().ready` authoritative without requiring every
    // caller to sit inside a Suspense boundary.
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