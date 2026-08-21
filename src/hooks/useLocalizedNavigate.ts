import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';
import { isLocaleExemptPath } from '@/lib/locale';
import type { NavigateOptions } from 'react-router';

export function useLocalizedNavigate() {
  const navigate = useNavigate();
  const { locale } = useParams<{ locale?: string }>();

  const currentLocale = locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  const localizedNavigate = useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === 'number') {
        navigate(to);
        return;
      }

      // Top-level routes (and external URLs) have no locale variant.
      if (isLocaleExemptPath(to)) {
        navigate(to, options);
        return;
      }

      const prefixed = currentLocale === DEFAULT_LOCALE ? to : `/${currentLocale}${to}`;
      navigate(prefixed, options);
    },
    [navigate, currentLocale],
  );

  return localizedNavigate;
}

export function useCurrentLocale() {
  const { locale } = useParams<{ locale?: string }>();
  return locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}
