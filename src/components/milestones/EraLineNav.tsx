import type { CSSProperties } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { StationRing } from '@/components/transit/StationRing';
import { HISTORY_ERAS, eraRangeLabel, type HistoryEra } from '@/config/historyEras';
import { isRtlLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
import { eraStroke, horizontalLine, pct, verticalLine } from './eraLineGeometry';

/**
 * The ten curated eras drawn as ten stations on the pink line — /history's
 * table of contents, and the page's one illustrative diagram.
 *
 * Replaces the old horizontal chip strip, which was `sticky`. This one is NOT,
 * for one reason only: **a line diagram is 3–8× the height of a chip row**
 * (340px desktop, 560px at 390px wide), and pinning that to the top of a phone
 * viewport spends most of the screen on navigation. It sits once, high on the
 * page, as its own band; `BackToTopButton` is the affordance for getting back.
 *
 * Two OTHER reasons were true when this was written and are no longer — do not
 * repeat them. #2710 found that the header never stuck at all (LayoutShell
 * wrapped it in a box only as tall as the chrome inside it, and that wrapper's
 * `z-10` capped the header's own z-index), fixed both, and added
 * `STICKY_UNDER_HEADER` next to `PAGE_GUTTER` so a bar no longer hand-rolls an
 * offset literal. So "the offset can never be right" and "the bar would overlap
 * the header" are both settled. If the height objection is ever answered — a
 * collapsed rail, say — sticky is available and `STICKY_UNDER_HEADER` is how.
 *
 * One `<ol>` renders both layouts, switched by CSS. A JS breakpoint gate would
 * double the anchor count and is one more way primary navigation can fail into
 * an empty band.
 */
export function EraLineNav({ counts }: { counts: Map<string, number> | undefined }) {
  const { t, i18n } = useTranslation();
  const { hash } = useLocation();
  // `i18n.language`, not `i18n.dir()` — the latter reads `resolvedLanguage` and
  // disagrees with the `<html dir>` the page actually renders under when a
  // bundle fails to load.
  const rtl = isRtlLocale(i18n.language);
  const eras = HISTORY_ERAS.filter((e) => (counts?.get(e.slug) ?? 1) > 0);
  if (eras.length < 2) return null;

  const h = horizontalLine(eras.length);
  const v = verticalLine(eras.length);

  return (
    <nav
      aria-label={t('milestones.eraNav', 'Jump to era')}
      className="border-b-4 border-foreground"
    >
      <PageContainer flush className="py-8 md:py-12">
        <h2 className="font-display text-headline">
          {t('milestones.eraNavHeading', 'The line, end to end')}
        </h2>

        {/* Stage height has to clear BOTH lanes: a plate is ~120px tall (p-4 +
            range line + a two-line rank-4 title + the count) and sits 24px off
            the line, so the below-lane needs 50% + 24 + 120 to stay inside the
            band. 240px clipped it into the next section. */}
        <div className="relative mt-6 lg:mt-10 lg:h-[340px]">
          {/* Desktop. The band stretches to the container width, so the aspect
              ratio is unlocked and the stroke is pinned — otherwise a 1400px
              line would be proportionally tall and the horizontal stretch
              would fatten the stroke with it. */}
          <svg
            viewBox={h.viewBox}
            preserveAspectRatio="none"
            className="absolute inset-0 hidden h-full w-full lg:block"
            aria-hidden
          >
            {/* Arabic mirrors the GEOMETRY, not the element. An
                `rtl:-scale-x-100` on the stage flips each station's own
                centring translate a second time and lands every ring off its
                line (measured at 32px on IntentMap), so the SVG mirrors itself
                internally and the plates take mirrored percentages — ordinary
                physical `left` the whole way down, and no type is ever
                reversed because nothing is scaled. */}
            <g
              fill="none"
              strokeWidth={7}
              strokeLinecap="butt"
              transform={rtl ? `translate(${h.w},0) scale(-1,1)` : undefined}
            >
              {h.segments.map((d, i) => (
                <path
                  key={eras[i].slug}
                  d={d}
                  stroke={eraStroke(eras[i])}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          </svg>

          {/* Mobile/tablet. Fixed 40px gutter, user units == CSS px, so nothing
              stretches and nothing deforms — which is why this line can bend
              where IntentMap's vertical rail had to fall back to a straight
              bar. */}
          <svg
            width={v.w}
            height={v.h}
            viewBox={v.viewBox}
            className="pointer-events-none absolute inset-y-0 start-0 lg:hidden"
            aria-hidden
          >
            <g fill="none" strokeWidth={3} strokeLinecap="butt">
              {v.segments.map((d, i) => (
                <path key={eras[i].slug} d={d} stroke={eraStroke(eras[i])} />
              ))}
            </g>
          </svg>

          <ol className="m-0 flex list-none flex-col p-0 lg:absolute lg:inset-0 lg:block">
            {eras.map((era, i) => (
              <EraStation
                key={era.slug}
                era={era}
                count={counts?.get(era.slug)}
                sx={pct(rtl ? h.w - h.stations[i].x : h.stations[i].x, h.w)}
                sy={pct(h.stations[i].y, h.h)}
                lane={i % 2 === 0 ? 'above' : 'below'}
                current={hash === `#era-${era.slug}`}
              />
            ))}
          </ol>
        </div>
      </PageContainer>
    </nav>
  );
}

function EraStation({
  era,
  count,
  sx,
  sy,
  lane,
  current,
}: {
  era: HistoryEra;
  count: number | undefined;
  sx: string;
  sy: string;
  lane: 'above' | 'below';
  current: boolean;
}) {
  const { t } = useTranslation();
  const label = t(era.titleKey);

  return (
    <li
      style={{ '--sx': sx, '--sy': sy } as CSSProperties}
      className={cn(
        'group relative flex items-center gap-2',
        'lg:absolute lg:left-[var(--sx)] lg:top-[var(--sy)] lg:block lg:h-0 lg:w-0 lg:gap-0',
      )}
    >
      {/* The ring is a SIBLING of the link, never inside it: `card-lift`
          translates the plate on hover, and a ring within would slide off
          the track with it.

          `h-14 w-10` is not arbitrary — 56px is V_ROW and 40px is V_GUTTER from
          eraLineGeometry, so centring the ring in this box lands it exactly on
          the station point the vertical SVG drew. Change one and you must
          change the other. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex h-14 w-10 shrink-0 items-center justify-center',
          'lg:absolute lg:left-0 lg:top-0 lg:h-auto lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2',
        )}
      >
        <StationRing
          state={era.restrained ? 'done' : 'typed'}
          track="pink"
          className="lg:h-6 lg:w-6 lg:border-[4px]"
        />
      </span>

      <a
        href={`#era-${era.slug}`}
        aria-current={current ? 'location' : undefined}
        aria-label={t('milestones.eraNavStation', '{{era}} — {{count}} milestones', {
          era: label,
          count: count ?? 0,
        })}
        className={cn(
          // `no-underline` is load-bearing: the unlayered `li a` rule in
          // index.css sets display:inline, which collapses the plate and voids
          // every lg: rule below it.
          'card-lift flex min-w-0 flex-1 items-baseline gap-2 border-2 border-foreground bg-background px-2 py-1.5 no-underline',
          'lg:absolute lg:left-1/2 lg:w-48 lg:-translate-x-1/2 lg:flex-none lg:flex-col lg:items-start lg:gap-1 lg:p-4',
          lane === 'above' ? 'lg:bottom-6' : 'lg:top-6',
          current && 'bg-foreground text-background',
        )}
      >
        <span className="text-2xs uppercase tracking-label opacity-70">{eraRangeLabel(era)}</span>
        <span className="min-w-0 flex-1 truncate text-title font-bold lg:line-clamp-2 lg:whitespace-normal">
          {label}
        </span>
        {count != null && <span className="shrink-0 text-13 font-bold tabular-nums">{count}</span>}
      </a>
    </li>
  );
}
