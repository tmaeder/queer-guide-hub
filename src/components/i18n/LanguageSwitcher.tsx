import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { Globe, ChevronDown } from '@/components/icons';

import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LANGUAGE_NAMES,
  isSupportedLocale,
} from '@/i18n/languages';
import type { SupportedLocale } from '@/i18n/languages';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  // Raw navigate: handleChange already computes the fully locale-prefixed
  // target. useLocalizedNavigate would re-prefix with the CURRENT route locale
  // (still set at click time), so switching away from a non-default locale
  // (e.g. de → en) bounced straight back to /de/... instead of /... .
  const navigate = useNavigate();
  const location = useLocation();

  // Derive the active locale from the URL path, NOT useParams(). This switcher
  // renders in the Footer, OUTSIDE the ":locale" route match, so useParams()
  // .locale is always undefined here — which made currentLocale default to 'en'
  // on every page. Consequences on /de/*: the trigger showed "English",
  // selecting English was a no-op (value already 'en' → Radix fires nothing),
  // and picking another language stacked prefixes (/de/help → /es/de/help)
  // because the existing /de segment was never stripped.
  const firstSegment = location.pathname.split('/')[1];
  const currentLocale: SupportedLocale = isSupportedLocale(firstSegment)
    ? firstSegment
    : DEFAULT_LOCALE;

  const handleChange = (newLocale: string) => {
    if (!isSupportedLocale(newLocale) || newLocale === currentLocale) return;

    const pathWithoutLocale = isSupportedLocale(firstSegment)
      ? location.pathname.slice(firstSegment.length + 1) || '/'
      : location.pathname;

    const newPath =
      newLocale === DEFAULT_LOCALE ? pathWithoutLocale : `/${newLocale}${pathWithoutLocale}`;

    i18n.changeLanguage(newLocale);
    navigate(newPath + location.search, { replace: true });
  };

  return (
    <div className="inline-flex items-center gap-1">
      <Globe size={16} className="shrink-0" aria-hidden="true" />
      <div className="relative">
        <select
          value={currentLocale}
          onChange={(event) => handleChange(event.target.value)}
          aria-label={t('i18n.selectLanguage', 'Select language')}
          className="cursor-pointer appearance-none rounded-element bg-transparent py-0 ps-1 pe-6 text-13 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ height: 36, border: 'none' }}
        >
          {SUPPORTED_LOCALES.map((lang) => (
            <option key={lang} value={lang} className="bg-background text-foreground">
              {LANGUAGE_NAMES[lang]}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute end-0 top-1/2 -translate-y-1/2 opacity-50"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
