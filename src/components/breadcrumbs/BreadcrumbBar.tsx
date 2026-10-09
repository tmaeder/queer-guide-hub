import { Fragment, useEffect, type CSSProperties } from 'react';
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
} from '@/components/ui/breadcrumb';
import { useBreadcrumbState, type BreadcrumbItem as Crumb } from '@/contexts/BreadcrumbContext';
import { getRouteBreadcrumbs, homeCrumb } from '@/config/breadcrumbs';
import { breadcrumbJsonLd } from '@/lib/breadcrumbJsonLd';
import { PAGE_GUTTER } from '@/components/layout/PageContainer';
import { routeJourneyTrack } from '@/components/layout/routeJourney';
import { RouteNetworkRail } from '@/components/layout/RouteNetworkRail';
import { StationRing } from '@/components/transit/StationRing';

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

  // Routes that deliberately publish no breadcrumb still retain the ambient
  // family rail. When a hierarchy exists, the breadcrumb stops replace that
  // decoration below — never stack a second route above it.
  if (!trail || trail.length <= 1) return <RouteNetworkRail pathname={pathname} />;

  const lastIndex = trail.length - 1;
  const track = routeJourneyTrack(pathname);
  // Collapse the middle of long trails on small screens to a single ellipsis.
  const collapse = trail.length > 3;

  return (
    <div
      className={`route-network-rail route-network-rail--breadcrumbs route-network-rail--${track}`}
    >
      <div
        className={`route-network-rail__inner route-network-rail__inner--breadcrumbs ${PAGE_GUTTER}`}
      >
        <div className="route-network-rail__canvas">
          <svg
            className="route-network-rail__breadcrumb-map"
            viewBox="0 0 900 52"
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
          >
            <path
              data-testid="breadcrumb-track"
              className={`route-network-rail__track route-network-rail__track--${track}`}
              d="M -20 28 C 170 10 320 42 470 27 C 620 12 740 40 920 22"
              pathLength="1"
            />
          </svg>
          <Breadcrumb className="route-network-rail__breadcrumb">
            {/* The semantic breadcrumb and the visible network are one thing:
                every crumb owns the station placed on the shared curve. */}
            <BreadcrumbList
              data-testid="breadcrumb-route"
              className="route-network-rail__crumb-list min-w-0 w-full flex-nowrap gap-0 overflow-visible"
            >
              {trail.map((crumb, i) => {
                const isLast = i === lastIndex;
                const isFirst = i === 0;
                const isMiddle = !isFirst && !isLast;
                // On mobile, hide middle crumbs behind one reachable station.
                const hideOnMobile = collapse && isMiddle;
                const mobileClass = hideOnMobile ? 'hidden md:flex' : '';
                const alignment = isFirst
                  ? 'items-start text-left'
                  : isLast
                    ? 'items-end text-right'
                    : 'items-center text-center';
                const justification = isFirst
                  ? 'justify-start'
                  : isLast
                    ? 'justify-end'
                    : 'justify-center';

                return (
                  <Fragment key={i}>
                    {/* Mobile-only overflow control, rendered once after the first
                      crumb. It is a station in its own right, so collapsing
                      the trail hides levels from VIEW without taking them out
                      of REACH or breaking the route line. */}
                    {collapse && i === 1 && (
                      <BreadcrumbItem
                        data-testid="breadcrumb-overflow"
                        className="route-network-rail__crumb-stop relative z-10 flex min-w-0 flex-1 justify-center md:hidden"
                        style={routeStopStyle(1, 3)}
                      >
                        <CollapsedCrumbsMenu
                          crumbs={trail.slice(1, lastIndex)}
                          track={track}
                          t={t}
                        />
                      </BreadcrumbItem>
                    )}
                    <BreadcrumbItem
                      data-breadcrumb-stop=""
                      data-current={isLast ? 'true' : undefined}
                      className={`route-network-rail__crumb-stop relative z-10 min-w-0 flex-1 whitespace-nowrap ${justification} ${mobileClass}`}
                      style={routeStopStyle(i, trail.length)}
                    >
                      {isLast ? (
                        <BreadcrumbPage
                          className={`flex min-w-0 max-w-full flex-col gap-1 ${alignment}`}
                        >
                          <StationRing state="typed" track={track} />
                          <span className="block max-w-full truncate bg-background px-1 text-13 font-bold">
                            {crumb.label}
                          </span>
                        </BreadcrumbPage>
                      ) : crumb.href ? (
                        <BreadcrumbLink asChild className="min-w-0 max-w-full">
                          <LocalizedLink
                            to={crumb.href}
                            className={`group flex min-w-0 max-w-full flex-col gap-1 ${alignment}`}
                          >
                            <StationRing
                              state="open"
                              track={track}
                              className="transition-colors group-hover:bg-surface-container"
                            />
                            <span className="block max-w-full truncate bg-background px-1 text-13 font-semibold text-foreground group-hover:underline">
                              {crumb.label}
                            </span>
                          </LocalizedLink>
                        </BreadcrumbLink>
                      ) : (
                        <span
                          className={`flex min-w-0 max-w-full flex-col gap-1 text-muted-foreground ${alignment}`}
                        >
                          <StationRing state="open" track={track} />
                          <span className="block max-w-full truncate bg-background px-1 text-13">
                            {crumb.label}
                          </span>
                        </span>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
    </div>
  );
}

/** Approximate the shared cubic at evenly-spaced breadcrumb positions. The
 * endpoints land at the path's y=28/y=22 and the sine term follows its two
 * bends closely enough that every HTML station sits visually on the SVG rail. */
function routeStopStyle(index: number, count: number): CSSProperties {
  const t = count <= 1 ? 0 : index / (count - 1);
  const y = 28 - 8 * Math.sin(t * Math.PI * 2) - 6 * t;
  return { '--route-stop-y': `${Math.round(y)}px` } as CSSProperties;
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
function CollapsedCrumbsMenu({
  crumbs,
  track,
  t,
}: {
  crumbs: Crumb[];
  track: ReturnType<typeof routeJourneyTrack>;
  t: TFunction;
}) {
  if (crumbs.length === 0) return null;
  return (
    <DropdownMenu>
      {/* The glyph is decorative and stays aria-hidden; the BUTTON carries the
          accessible name. `min-height: 44px` comes from the base layer. */}
      <DropdownMenuTrigger
        className="group inline-flex min-w-0 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={t('breadcrumb.showCollapsed', 'Show the levels above')}
      >
        <StationRing
          state="open"
          track={track}
          className="transition-colors group-hover:bg-surface-container"
        />
        <span className="bg-background px-1">
          <BreadcrumbEllipsis />
        </span>
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
