import { forwardRef } from 'react';
import { Link, useParams } from 'react-router';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';
import type { ComponentProps } from 'react';

type LinkProps = ComponentProps<typeof Link>;

export const LocalizedLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function LocalizedLink({ to, ...props }, ref) {
    const { locale } = useParams<{ locale?: string }>();
    const currentLocale = locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

    let localizedTo = to;
    if (typeof to === 'string') {
      // Don't prefix admin, auth, or external paths
      if (!to.startsWith('/admin') && !to.startsWith('/auth') && !to.startsWith('http')) {
        localizedTo = currentLocale === DEFAULT_LOCALE ? to : `/${currentLocale}${to}`;
      }
    }

    return <Link ref={ref} to={localizedTo} {...props} />;
  },
);
