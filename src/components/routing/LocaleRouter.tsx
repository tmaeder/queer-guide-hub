import { lazy, useEffect } from 'react';
import { Outlet, useParams, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, RTL_LOCALES, SUPPORTED_LOCALES, isSupportedLocale } from '@/i18n/languages';
import type { SupportedLocale } from '@/i18n/languages';

const NotFound = lazy(() => import('@/pages/NotFound'));

function getLocaleFromPath(pathname: string): SupportedLocale {
  const segment = pathname.split('/')[1];
  if (segment && isSupportedLocale(segment)) return segment;
  return DEFAULT_LOCALE;
}

export function LocaleRouter() {
  const { i18n } = useTranslation();
  const { locale } = useParams<{ locale?: string }>();
  const location = useLocation();

  // If the first path segment exists but is not a supported locale, this URL
  // is not a real route — render NotFound instead of letting the index route
  // swallow it into the homepage.
  const localeIsUnknown = !!locale && !isSupportedLocale(locale);

  const resolvedLocale = locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  useEffect(() => {
    if (i18n.language !== resolvedLocale) {
      i18n.changeLanguage(resolvedLocale);
    }

    document.documentElement.lang = resolvedLocale;
    document.documentElement.dir = RTL_LOCALES.includes(resolvedLocale) ? 'rtl' : 'ltr';
  }, [resolvedLocale, i18n]);

  // Inject hreflang alternate links for SEO
  useEffect(() => {
    const existing = document.querySelectorAll('link[data-hreflang]');
    existing.forEach((el) => el.remove());

    const pathWithoutLocale = locale && isSupportedLocale(locale)
      ? location.pathname.replace(`/${locale}`, '') || '/'
      : location.pathname;

    const origin = window.location.origin;

    SUPPORTED_LOCALES.forEach((lang) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = lang;
      link.href = lang === DEFAULT_LOCALE
        ? `${origin}${pathWithoutLocale}`
        : `${origin}/${lang}${pathWithoutLocale}`;
      link.setAttribute('data-hreflang', 'true');
      document.head.appendChild(link);
    });

    // x-default points to English (unprefixed)
    const xDefault = document.createElement('link');
    xDefault.rel = 'alternate';
    xDefault.hreflang = 'x-default';
    xDefault.href = `${origin}${pathWithoutLocale}`;
    xDefault.setAttribute('data-hreflang', 'true');
    document.head.appendChild(xDefault);

    return () => {
      document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());
    };
  }, [location.pathname, locale]);

  if (localeIsUnknown) return <NotFound />;

  return <Outlet />;
}

export { getLocaleFromPath };
