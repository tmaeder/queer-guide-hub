import { Fragment, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { getRouteBreadcrumbs, homeCrumb } from '@/config/breadcrumbs';
import { breadcrumbJsonLd } from '@/lib/breadcrumbJsonLd';
import { PAGE_GUTTER } from '@/components/layout/PageContainer';

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
  // Crumb hrefs are passed to LocalizedLink RAW. There used to be a `loc()`
  // helper here that prefixed the locale itself, on the premise that
  // "LocalizedLink can't read the locale here (bar is outside the :locale?
  // Routes)". That premise no longer holds, and the two prefixes stacked:
  // measured on production 2026-08-16, every crumb on a French detail page
  // pointed at `/fr/fr/…` (`/fr/fr/`, `/fr/fr/news`,
  // `/fr/fr/news?category=rights-legal`), which 404s. It was reaching the
  // error board as a steady trickle of `[404] /:locale/fr/*` reports across
  // six sections.
  //
  // If LocalizedLink ever stops resolving the locale here, the fix is to make
  // it resolve — not to re-add a second prefixer. Two things that both prefix
  // cannot be made correct by tuning either one.

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
    <div className="bg-background">
      {/* Bar is full-bleed; its CONTENT takes the page gutter + cap so the
          first crumb starts on the same vertical as the page heading below it
          and the nav above it. */}
      <div
        className={`mx-auto flex w-full max-w-page min-h-11 items-center overflow-hidden py-2.5 ${PAGE_GUTTER}`}
      >
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
                  {/* Mobile-only overflow control, rendered once after the first
                      crumb. It carries the crumbs the row has no width for, so
                      collapsing the trail hides them from VIEW without putting
                      them out of REACH. */}
                  {collapse && i === 1 && (
                    <BreadcrumbItem
                      data-testid="breadcrumb-overflow"
                      className="shrink-0 md:hidden"
                    >
                      <CollapsedCrumbsMenu crumbs={trail.slice(1, lastIndex)} t={t} />
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
                        <LocalizedLink to={crumb.href}>{crumb.label}</LocalizedLink>
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

/**
 * The crumbs the mobile row collapsed, as a menu behind the ellipsis.
 *
 * Until 2026-09-05 the ellipsis was a `<span role="presentation"
 * aria-hidden="true">` — decoration standing in for content nobody could get
 * to. The middle crumbs are `display: none` below `md`, which removes them
 * from the tab order and the accessibility tree as well as from view, so a
 * phone measured on prod offered exactly ONE reachable level (Home) on a trail
 * of five. Breadcrumbs exist to navigate UP; a trail that cannot be climbed is
 * decoration too.
 *
 * A menu rather than an expand-in-place toggle: the row is deliberately locked
 * to one line (`flex-nowrap overflow-hidden`), so revealing the crumbs inline
 * would clip them against the same width that hid them.
 *
 * A crumb with no href stays unreachable — it has no destination (a venue in a
 * city we hold no record for). It is rendered as a disabled item rather than
 * dropped, so the menu still describes the full path.
 */
function CollapsedCrumbsMenu({ crumbs, t }: { crumbs: Crumb[]; t: TFunction }) {
  if (crumbs.length === 0) return null;
  return (
    <DropdownMenu>
      {/* The glyph is decorative and stays aria-hidden; the BUTTON carries the
          accessible name. `min-height: 44px` comes from the base layer. */}
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center px-1 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={t('breadcrumb.showCollapsed', 'Show the levels above')}
      >
        <BreadcrumbEllipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {crumbs.map((crumb, i) =>
          crumb.href ? (
            <DropdownMenuItem key={i} asChild>
              <LocalizedLink to={crumb.href} className="no-underline">
                {crumb.label}
              </LocalizedLink>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={i} disabled>
              {crumb.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default BreadcrumbBar;
