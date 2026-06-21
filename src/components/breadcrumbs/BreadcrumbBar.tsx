import { Fragment, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useBreadcrumbState, type BreadcrumbItem as Crumb } from '@/contexts/BreadcrumbContext';
import { getRouteBreadcrumbs, homeCrumb, localeFromPath } from '@/config/breadcrumbs';
import { breadcrumbJsonLd } from '@/lib/breadcrumbJsonLd';

/**
 * Global breadcrumb bar rendered below the header (in LayoutShell).
 * Prefers a page-published trail (entity-aware, e.g. "Berlin"); otherwise
 * derives a fallback from the pathname. Renders nothing on home/hidden routes
 * or when the trail is a single crumb. Detail (page-published) trails also
 * emit a schema.org BreadcrumbList for SEO.
 */
export function BreadcrumbBar() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const published = useBreadcrumbState();
  // LocalizedLink can't read the locale here (bar is outside the :locale? Routes),
  // so prefix hrefs ourselves from the path.
  const locale = localeFromPath(pathname);
  const loc = (href: string) => (locale && href.startsWith('/') ? `/${locale}${href}` : href);

  // Page trails are entity-only; prepend the shared Home crumb so every trail
  // is anchored consistently (and starts with a clickable Home).
  const trail: Crumb[] | null = published
    ? [homeCrumb(t), ...published]
    : getRouteBreadcrumbs(pathname, t);

  // SEO: emit BreadcrumbList only for page-published (detail) trails.
  useEffect(() => {
    const ld = published ? breadcrumbJsonLd(trail) : null;
    document.querySelectorAll('script[data-breadcrumb-jsonld]').forEach((el) => el.remove());
    if (!ld) return;
    const script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-breadcrumb-jsonld', 'true');
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
    return () => {
      document.querySelectorAll('script[data-breadcrumb-jsonld]').forEach((el) => el.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, JSON.stringify(published?.map((c) => [c.label, c.href]) ?? null)]);

  if (!trail || trail.length <= 1) return null;

  const lastIndex = trail.length - 1;
  // Collapse the middle of long trails on small screens to a single ellipsis.
  const collapse = trail.length > 3;

  return (
    <div className="border-b border-border bg-background">
      <div className="container mx-auto flex min-h-11 items-center overflow-hidden px-4 py-2.5">
        <Breadcrumb className="min-w-0 max-w-full">
          {/* Locked to a single line: every crumb but the last keeps its width
              (shrink-0); the last crumb absorbs the remaining space and
              truncates with an ellipsis so the row never wraps or overflows. */}
          <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
            {trail.map((crumb, i) => {
              const isLast = i === lastIndex;
              const isFirst = i === 0;
              const isMiddle = !isFirst && !isLast;
              // On mobile, hide middle crumbs. Their leading separators hide too,
              // except the very first one (Home → ellipsis), which stays.
              const hideOnMobile = collapse && isMiddle;
              const mobileClass = hideOnMobile ? 'hidden md:inline-flex' : '';
              const hideSep = collapse && isMiddle && i !== 1;

              return (
                <Fragment key={i}>
                  {i > 0 && (
                    <BreadcrumbSeparator
                      className={`shrink-0 ${hideSep ? 'hidden md:inline-flex' : ''}`}
                    />
                  )}
                  {/* Mobile-only ellipsis stand-in, shown once after the first crumb. */}
                  {collapse && i === 1 && (
                    <BreadcrumbItem className="shrink-0 md:hidden">
                      <BreadcrumbEllipsis />
                    </BreadcrumbItem>
                  )}
                  <BreadcrumbItem
                    className={
                      isLast
                        ? 'min-w-0 flex-1 whitespace-nowrap'
                        : `shrink-0 whitespace-nowrap ${mobileClass}`
                    }
                  >
                    {isLast ? (
                      <BreadcrumbPage className="block truncate">{crumb.label}</BreadcrumbPage>
                    ) : crumb.href ? (
                      <BreadcrumbLink asChild>
                        <LocalizedLink to={loc(crumb.href)}>{crumb.label}</LocalizedLink>
                      </BreadcrumbLink>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  );
}

export default BreadcrumbBar;
