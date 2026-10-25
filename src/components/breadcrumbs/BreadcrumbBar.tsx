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
  const fractions = stopFractions(trail.length);

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
            viewBox={`0 0 ${TRACK_W} 52`}
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
          >
            <path
              data-testid="breadcrumb-track"
              className={`route-network-rail__track route-network-rail__track--${track} ${collapse ? 'hidden md:inline' : ''}`}
              d={trackPath(fractions)}
              pathLength="1"
            />
            {collapse && (
              <path
                className={`route-network-rail__track route-network-rail__track--${track} md:hidden`}
                d={trackPath(stopFractions(3))}
                pathLength="1"
              />
            )}
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
                const ringPlace = ringPlacement(isFirst, isLast);

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
                        style={stopStyle(0.5)}
                      >
                        <CollapsedCrumbsMenu
                          crumbs={trail.slice(1, lastIndex)}
                          track={track}
                          t={t}
                          ringClass={ringPlacement(false, false)}
                        />
                      </BreadcrumbItem>
                    )}
                    <BreadcrumbItem
                      data-breadcrumb-stop=""
                      data-current={isLast ? 'true' : undefined}
                      className={`route-network-rail__crumb-stop relative z-10 min-w-0 flex-1 whitespace-nowrap ${justification} ${mobileClass}`}
                      style={stopStyle(
                        fractions[i],
                        collapse && !isMiddle ? Number(isLast) : undefined,
                      )}
                    >
                      {isLast ? (
                        <BreadcrumbPage className={`flex min-w-0 max-w-full flex-col ${alignment}`}>
                          <StationRing state="typed" track={track} className={ringPlace} />
                          <span className="block max-w-full truncate bg-background px-1 text-13 font-bold">
                            {crumb.label}
                          </span>
                        </BreadcrumbPage>
                      ) : crumb.href ? (
                        <BreadcrumbLink asChild className="min-w-0 max-w-full">
                          <LocalizedLink
                            to={crumb.href}
                            className={`group flex min-w-0 max-w-full flex-col ${alignment}`}
                          >
                            <StationRing
                              state="open"
                              track={track}
                              className={`${ringPlace} transition-colors group-hover:bg-surface-container`}
                            />
                            <span className="block max-w-full truncate bg-background px-1 text-13 font-semibold text-foreground group-hover:underline">
                              {crumb.label}
                            </span>
                          </LocalizedLink>
                        </BreadcrumbLink>
                      ) : (
                        <span
                          className={`flex min-w-0 max-w-full flex-col text-muted-foreground ${alignment}`}
                        >
                          <StationRing state="open" track={track} className={ringPlace} />
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

const TRACK_W = 1000;

/** Where each station's ring centre sits, as a fraction of the row width.
 * Stops are `flex-1` cells: the first pins its ring to the left edge, the last
 * to the right edge, middle rings sit at their cell centre. */
function stopFractions(count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? 0 : i === count - 1 ? 1 : (i + 0.5) / count,
  );
}

/** The gentle wave every ring sits on, in px from the top of the rail. */
function waveY(f: number): number {
  return Math.round(24 - 7 * Math.sin(f * Math.PI * 2) - 4 * f);
}

/** A smooth (Catmull-Rom) curve passing exactly through every station, so a
 * ring can never drift off the line. Wave points between stations keep a
 * two-stop trail from collapsing into a straight line. */
function trackPath(stops: number[]): string {
  const fs = [...new Set([...stops, 0.25, 0.5, 0.75])].sort((a, b) => a - b);
  const pts: [number, number][] = [
    [-40, waveY(0) + 3],
    ...fs.map((f): [number, number] => [f * TRACK_W, waveY(f)]),
    [TRACK_W + 40, waveY(1) - 3],
  ];
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1.join(' ')} ${c2.join(' ')} ${p2.join(' ')}`;
  }
  return d;
}

/** Ring height for a stop at row fraction `f`. Below `md` a collapsed trail
 * shows only three stations, so a stop can sit at a different fraction there. */
function stopStyle(f: number, mobileF = f): CSSProperties {
  return {
    '--route-stop-y': `${waveY(f)}px`,
    '--route-stop-y-mobile': `${waveY(mobileF)}px`,
  } as CSSProperties;
}

/** Rings hang on the curve; labels share one baseline below it. */
function ringPlacement(isFirst: boolean, isLast: boolean): string {
  const x = isFirst ? '-left-2' : isLast ? '-right-2' : 'left-1/2 -translate-x-1/2';
  return `route-network-rail__crumb-ring absolute ${x}`;
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
  ringClass,
}: {
  crumbs: Crumb[];
  track: ReturnType<typeof routeJourneyTrack>;
  t: TFunction;
  ringClass: string;
}) {
  if (crumbs.length === 0) return null;
  return (
    <DropdownMenu>
      {/* The glyph is decorative and stays aria-hidden; the BUTTON carries the
          accessible name. `min-height: 44px` comes from the base layer. */}
      <DropdownMenuTrigger
        className="group inline-flex min-w-0 flex-col items-center justify-start text-muted-foreground transition-colors hover:text-foreground"
        aria-label={t('breadcrumb.showCollapsed', 'Show the levels above')}
      >
        <StationRing
          state="open"
          track={track}
          className={`${ringClass} transition-colors group-hover:bg-surface-container`}
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
