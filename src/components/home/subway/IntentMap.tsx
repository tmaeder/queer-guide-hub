import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TRACK_BG, type Track } from '@/components/transit/routeBulletMap';
import { isIntentActive } from '@/config/navigation';
import { isRtlLocale, stripLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
import { STATIONS, TRACK_PATHS, VIEWBOX, pct, type Station } from './intentMapGeometry';

/**
 * The six intents, on the homepage, AS the stations of the network drawing.
 *
 * Replaces the pair of components that used to describe the same network and
 * share no data: `TrackLines` (four tracks plus five decorative rings and
 * three hardcoded English labels that shipped untranslated to eleven locales)
 * and `IntentRail` (the six real links, in a flat grid, unrelated to the
 * drawing above them). A station's line comes from `INTENT_TRACK`, the same
 * table the header and footer read, so the three surfaces cannot disagree.
 *
 * Rendered EAGERLY and with no reveal animation — deliberately not wrapped in
 * `HomeDeferred`. Every other homepage section sits behind two independent
 * gates (`DeferredSection`'s IntersectionObserver and `FadeIn`'s `whileInView`,
 * which fires at 15% visibility and ignores `prefers-reduced-motion`). If
 * either fails to fire, the section stays at `opacity: 0` while still occupying
 * its full height. That is a tolerable failure for a marketplace rail and an
 * unacceptable one for the site's primary navigation — a blank band where the
 * nav should be is indistinguishable from a broken page.
 *
 * For the same reason the desktop/mobile split is CSS-only. One `<ul>` renders
 * both layouts; a JS breakpoint gate would be one more way the primary
 * navigation can fail into an empty band, and it would put fourteen anchors in
 * the DOM for seven destinations.
 *
 * It is also above the fold, so there is nothing to defer.
 */
export function IntentMap() {
  const { t, i18n } = useTranslation();
  const path = stripLocale(useLocation().pathname);
  // `isRtlLocale` is the same predicate `syncHtmlLangDir` uses to write
  // <html dir>, so this map mirrors WITH the page and can never mirror
  // against it. Not `i18n.dir()` — see the note on the shared helper.
  const rtl = isRtlLocale(i18n.language);

  return (
    <section
      aria-labelledby="intent-map-heading"
      className="px-4 py-12 sm:px-6 md:px-8 md:py-16 lg:px-0 lg:py-20"
    >
      {/* The key is named for the mobile sheet it was written for; the string
          is exactly right here and is already translated in all 11 locales. */}
      <h2
        id="intent-map-heading"
        // `max-w-page`, not `max-w-7xl`: the heading is page copy and lines up
        // with the nav above it. The map STAGE below deliberately does not —
        // it is a full-bleed illustration and takes the whole window.
        className="mx-auto mb-8 max-w-page font-display text-headline lg:mb-24 lg:px-8"
      >
        {t('header.intents.sheetHeading', 'What are you here for?')}
      </h2>

      {/* Arabic mirrors the GEOMETRY, not the element: an `rtl:-scale-x-100`
          on this stage flips the ring's own centring translate a second time
          and lands every station 32px off its line (measured). So the SVG
          mirrors itself internally and the stations get mirrored percentages
          — ordinary physical `left` the whole way down, no double flips, and
          the type is never reversed because nothing is scaled. */}
      {/* NO max-width. The tracks are drawn from x=-40 to x=1480 in a 0..1440
          viewBox precisely so they bleed off both edges of the stage; a cap on
          the stage put that bleed 96px inside the window at 1920px and the
          lines read as four short strokes with rounded ends floating in a
          margin. Full bleed is the whole point of the drawing — the section
          already drops its gutter at `lg`, and `SubwayHero` clips. */}
      <div className="intent-map relative">
        {/* Decorative: every label on this map is HTML. */}
        <svg
          viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
          className="hidden w-full lg:block"
          aria-hidden
        >
          <g
            fill="none"
            strokeWidth={12}
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={rtl ? `translate(${VIEWBOX.w},0) scale(-1,1)` : undefined}
          >
            {(Object.keys(TRACK_PATHS) as Track[]).map((track) => (
              <path
                key={track}
                d={TRACK_PATHS[track]}
                stroke={`hsl(var(--track-${track}))`}
                className={`intent-track-${track}`}
              />
            ))}
          </g>
        </svg>

        {/* Mobile rail. A 6px bar, not an SVG: a height-driven vertical SVG
            needs `preserveAspectRatio="none"`, which would deform every ring
            as the list height changes with the locale. Centred in the 48px
            gutter each row reserves for it, so ring and rail cannot drift
            apart. */}
        <span
          aria-hidden
          className="absolute bottom-6 start-[21px] top-6 w-1.5 bg-foreground lg:hidden"
        />

        <ul className="m-0 flex list-none flex-col gap-4 p-0 lg:absolute lg:inset-0 lg:block lg:gap-0">
          {STATIONS.map((station) => (
            <StationNode key={station.id} station={station} path={path} rtl={rtl} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function StationNode({ station, path, rtl }: { station: Station; path: string; rtl: boolean }) {
  const { t } = useTranslation();
  const interchange = station.id === 'interchange';
  // `findActiveIntent('/')` is undefined, so nothing is ever current on the
  // homepage. Kept because it is correct-by-construction wherever this map
  // gets reused, and it costs one attribute.
  const active = station.intent ? isIntentActive(station.intent, path) : false;

  return (
    <li
      data-track={station.track}
      style={
        {
          '--sx': pct(rtl ? VIEWBOX.w - station.x : station.x, 'x'),
          '--sy': pct(station.y, 'y'),
        } as CSSProperties
      }
      className={cn(
        // Mobile: a row with a fixed gutter for the rail.
        'group relative flex items-start gap-2',
        // Desktop: a zero-size anchor point parked exactly on the curve.
        'lg:absolute lg:block lg:h-0 lg:w-0 lg:gap-0 lg:left-[var(--sx)] lg:top-[var(--sy)]',
      )}
    >
      {/* The ring is a SIBLING of the link, never inside it — `card-lift`
          translates the plate on hover, and a ring within it would slide off
          the track. `pointer-events-none` keeps the whole mobile row
          clickable through it.
          On mobile it is FLOW-positioned inside a 48px gutter, so it centres
          on the rail by flex alone — no inset utility, hence no cascade fight
          with the desktop one, and nothing to counter-flip under RTL. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex w-12 shrink-0 justify-center pt-6',
          'lg:absolute lg:left-0 lg:top-0 lg:block lg:w-auto lg:p-0',
          'lg:-translate-x-1/2 lg:-translate-y-1/2',
        )}
      >
        <span
          className={cn(
            'block rounded-full border border-border-hairline',
            'transition-colors group-hover:bg-foreground group-focus-within:bg-foreground',
            interchange
              ? 'intersection-gradient h-11 w-11 lg:h-12 lg:w-12'
              : cn('h-8 w-8', TRACK_BG[station.track]),
          )}
        />
      </span>

      <LocalizedLink
        to={station.to}
        aria-current={active ? 'page' : undefined}
        className={cn(
          // `no-underline` is load-bearing, not cosmetic: the unlayered
          // `li a:not(.no-underline)` rule in index.css sets `display: inline`,
          // which collapses the plate and silently kills every `lg:` position
          // below it. Asserted in the unit test.
          'card-lift flex min-w-0 flex-1 flex-col gap-1 bg-card p-4 no-underline rounded-container shadow-soft',
          'lg:absolute lg:left-1/2 lg:w-40 lg:flex-none lg:-translate-x-1/2 xl:w-48',
          station.lane === 'above' ? 'lg:bottom-full lg:mb-4' : 'lg:top-full lg:mt-4',
        )}
      >
        {interchange && (
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">
            {t('home.map.interchangeEyebrow', 'Interchange')}
          </span>
        )}
        <span className="text-title font-bold text-foreground">
          {t(station.labelKey, station.labelFallback)}
        </span>
        {/* `line-clamp-2` holds the plate at the height the overflow budget
            assumes. Without it the German subtitles run to four lines and
            collide with the heading — which looks fine in English review. */}
        <span className="line-clamp-2 text-13 text-muted-foreground">
          {t(station.subtitleKey, station.subtitleFallback)}
        </span>
      </LocalizedLink>
    </li>
  );
}

export default IntentMap;
