import { lazy, useEffect } from 'react';
import { Outlet, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';
import type { SupportedLocale } from '@/i18n/languages';

// Also serves Bluesky-style /@handle links, whose first segment is not a locale.
const NotFound = lazy(() => import('@/pages/social/HandleOrNotFound'));

function getLocaleFromPath(pathname: string): SupportedLocale {
  const segment = pathname.split('/')[1];
  if (segment && isSupportedLocale(segment)) return segment;
  return DEFAULT_LOCALE;
}

export function LocaleRouter() {
  const { i18n } = useTranslation();
  const { locale } = useParams<{ locale?: string }>();

  // If the first path segment exists but is not a supported locale, this URL
  // is not a real route — render NotFound instead of letting the index route
  // swallow it into the homepage.
  const localeIsUnknown = !!locale && !isSupportedLocale(locale);

  const resolvedLocale = locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  useEffect(() => {
    // <html lang>/<dir> are kept in sync by the single `languageChanged`
    // handler in `@/i18n` — changing the language here triggers it.
    if (i18n.language !== resolvedLocale) {
      i18n.changeLanguage(resolvedLocale);
    }
  }, [resolvedLocale, i18n]);

  if (localeIsUnknown) return <NotFound />;

  return <Outlet />;
}

// eslint-disable-next-line react-refresh/only-export-components
export { getLocaleFromPath };
