import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { StationRing } from '@/components/transit/StationRing';
import { HISTORY_ERAS, eraRangeLabel, type HistoryEra } from '@/config/historyEras';
import { cn } from '@/lib/utils';
import { eraStroke, verticalLine } from './eraLineGeometry';

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
  const { t } = useTranslation();
  const { hash } = useLocation();
  // RTL needs no code here: the grid follows the document direction and each
  // gap's SVG flips its own drawing.
  const eras = HISTORY_ERAS.filter((e) => (counts?.get(e.slug) ?? 1) > 0);
  if (eras.length < 2) return null;

  const v = verticalLine(eras.length);

  return (
    <nav
      aria-label={t('milestones.eraNav', 'Jump to era')}
      className="border-b border-border-hairline"
    >
      <PageContainer flush className="py-8 md:py-12">
        <h2 className="font-display text-headline">
          {t('milestones.eraNavHeading', 'The line, end to end')}
        </h2>

        {/* Desktop is a strip map: one evenly spaced station per era, each
            label directly under its own station, the line between them drawn
            per gap. It replaced a 340px band where the line swung top to
            bottom between stations and 192px plates alternated above and
            below it: wider than the ~130px between stations, so they covered
            the line and each other, and a plate's station was hard to find.
            Phones keep the vertical line and row plates below. */}
        <div className="relative mt-6 lg:mt-10">
          {/* Mobile/tablet. Fixed 40px gutter, user units == CSS px, so nothing
              stretches and nothing deforms. */}
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

          <ol
            className="m-0 flex list-none flex-col p-0 lg:grid"
            style={{ gridTemplateColumns: `repeat(${eras.length}, minmax(0, 1fr))` }}
          >
            {eras.map((era, i) => (
              <EraStation
                key={era.slug}
                era={era}
                next={eras[i + 1]}
                flip={i % 2 === 1}
                count={counts?.get(era.slug)}
                current={hash === `#era-${era.slug}`}
              />
            ))}
          </ol>
        </div>

        {/* The ink stretches are deliberate; say so, or they read as a second
            line. */}
        <p className="mt-6 flex items-center gap-2 text-13 text-muted-foreground">
          <span aria-hidden className="inline-block h-1.5 w-6 rounded-full bg-foreground" />
          {t('milestones.eraNavInk', 'Drawn in ink: eras of persecution.')}
        </p>
      </PageContainer>
    </nav>
  );
}

/** Wave depth across one gap, in px either side of the line. */
const AMP = 9;

function EraStation({
  era,
  next,
  flip,
  count,
  current,
}: {
  era: HistoryEra;
  /** The era after this one; the gap to it is drawn in THIS era's stroke. */
  next: HistoryEra | undefined;
  flip: boolean;
  count: number | undefined;
  current: boolean;
}) {
  const { t } = useTranslation();
  const label = t(era.titleKey);
  const a = flip ? -AMP : AMP;

  return (
    <li className="group relative flex items-center gap-2 lg:flex-col lg:items-center lg:gap-2">
      {/* Desktop track: one gentle S from this ring's centre to the next. The
          box spans ring centre to ring centre, so a station cannot sit off
          its line. Hidden below lg, where the vertical SVG above draws it. */}
      {next && (
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          className="pointer-events-none absolute start-1/2 top-0 hidden h-6 w-full overflow-visible lg:block rtl:-scale-x-100"
        >
          <path
            d={`M 0 12 C 33 ${12 + a}, 67 ${12 - a}, 100 12`}
            fill="none"
            stroke={eraStroke(era)}
            strokeWidth={7}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      {/* The ring is a SIBLING of the link, never inside it, so a hover lift
          on the link can never slide the ring off the track. `h-14 w-10` is
          V_ROW x V_GUTTER from eraLineGeometry: centred in it, the ring lands
          on the station point the vertical SVG drew. */}
      <span
        aria-hidden
        className="pointer-events-none relative z-10 flex h-14 w-10 shrink-0 items-center justify-center lg:h-6 lg:w-6"
      >
        <StationRing
          state={era.restrained ? 'done' : 'typed'}
          track="pink"
          className="lg:h-6 lg:w-6"
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
          // index.css sets display:inline, which collapses the plate.
          'card-lift flex min-w-0 flex-1 items-baseline gap-2 rounded-container bg-card px-2 py-1.5 no-underline shadow-soft',
          // Desktop: a label under its station, not a plate over the line.
          'lg:w-full lg:flex-none lg:flex-col lg:items-center lg:gap-0.5 lg:rounded-element lg:bg-transparent lg:px-1 lg:py-1 lg:text-center lg:shadow-none',
          current && 'bg-foreground text-background lg:bg-foreground',
        )}
      >
        <span className="text-2xs uppercase tracking-label opacity-70">{eraRangeLabel(era)}</span>
        <span className="min-w-0 flex-1 truncate text-title font-bold lg:line-clamp-2 lg:whitespace-normal lg:text-15 lg:leading-tight">
          {label}
        </span>
        {count != null && <span className="shrink-0 text-13 font-bold tabular-nums">{count}</span>}
      </a>
    </li>
  );
}
