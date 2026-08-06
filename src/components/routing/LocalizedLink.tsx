import { forwardRef } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';
import type { ComponentProps } from 'react';

type LinkProps = ComponentProps<typeof Link>;

export const LocalizedLink = forwardRef<HTMLAnchorElement, LinkProps>(function LocalizedLink(
  { to, ...props },
  ref,
) {
  // `useParams().locale` only resolves for components rendered INSIDE the
  // `/:locale?` route. Header, Footer and MobileNavSheet are siblings of the
  // route table in LayoutShell, so there it was always undefined and every
  // primary-nav link silently dropped the locale: a German reader on
  // /de/going-out clicking "Reisen" landed on /travel, not /de/travel —
  // losing the prefix that canonical, hreflang and any shared URL depend on.
  // The pathname is the one signal available in both positions.
  const { locale: paramLocale } = useParams<{ locale?: string }>();
  const { pathname } = useLocation();
  const pathLocale = pathname.split('/')[1];
  const locale = paramLocale ?? pathLocale;
  const currentLocale = locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  let localizedTo = to;
  if (typeof to === 'string') {
    // Don't prefix admin, auth, or external paths
    if (!to.startsWith('/admin') && !to.startsWith('/auth') && !to.startsWith('http')) {
      localizedTo = currentLocale === DEFAULT_LOCALE ? to : `/${currentLocale}${to}`;
    }
  }

  return <Link ref={ref} to={localizedTo} {...props} />;
});
