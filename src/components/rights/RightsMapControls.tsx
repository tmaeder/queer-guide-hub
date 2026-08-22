import { Fragment, useEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { FilterChip } from '@/components/transit/FilterChip';
import { TrackSwatch } from '@/components/transit/TrackSwatch';
import {
  RIGHT_SECTION_ORDER,
  RIGHT_SECTION_SHORT_LABEL,
  topicsInSection,
  topicListLabel,
  type RightTopic,
} from '@/lib/rights/rightsCatalog';
import type { RightsLens } from '@/lib/rights/rightsClassify';
import {
  SECTION_TRACK,
  MAP_CLASS_ORDER,
  MAP_CLASS_LABEL,
  MAP_CLASS_INK,
  type MapClass,
} from '@/lib/rights/rightsMapModel';
import { TRACK_BG, TRACK_TEXT } from '@/components/transit/routeBulletMap';

/**
 * The two control surfaces for the /rights world map: which line/station
 * (right) is painted, which lens (whose protection) narrows a
 * protection-matrix reading, plus the route-strip legend that reads the
 * result back as counts.
 *
 * LAYOUT: one rail, never five rows. The first version gave each of the five
 * rights families its own labelled row, which cost ~400px on desktop and
 * ~620px on mobile — more than the map it filters, and a shape no other filter
 * bar in this app has. Every one of them (events, cities, marketplace, tags)
 * is at most two rows with a single horizontally-scrolling chip line, and
 * EventsControlBar's header states the rule: nothing wraps, because a wrapped
 * row is height subtracted from every screen for the whole session
 * (CitiesControlBar measured 76px of it). The families survive as inline
 * `TrackSwatch` dividers — a swatch says in 20px what a row header said in 60.
 *
 * MOTION, reconciled with composed primitives. The rule this page holds is
 * that nothing MOVES: no entrance, no exit, no reveal, no fly-to — someone may
 * be reading it to decide whether a border is safe to cross. `FilterChip`
 * bakes in `transition-colors duration-fast`, and that is not motion: it
 * changes no position, size or opacity of content, only the hover state of the
 * control under the pointer. So this file composes the shared chip rather than
 * forking it — a `transition-none` override here would make these the only
 * chips in the app that snap, invisibly to whoever next edits FilterChip. What
 * remains banned is the house "chip opens a popover" pattern: PopoverContent
 * bakes in `zoom-in-95` / `slide-in-from-top-2`, which IS motion, and cannot
 * be cancelled from a className (tailwind-merge does not know
 * tailwindcss-animate's `animate-in`).
 *
 * Track colours are wayfinding, never risk — only the active station takes a
 * track fill, and it always carries `border-track-ring` (WCAG 1.4.11,
 * fill-vs-ring). The legend is the one place `--destructive` may appear,
 * reserved for the two criminal-exposure-with-death classes.
 */

const LENS_OPTIONS: readonly { value: RightsLens; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'so', label: 'Sexual orientation' },
  { value: 'gi', label: 'Gender identity' },
  { value: 'ge', label: 'Gender expression' },
  { value: 'sc', label: 'Sex characteristics' },
];

interface RightsMapControlsProps {
  topic: RightTopic;
  onTopicChange: (t: RightTopic) => void;
  lens: RightsLens;
  onLensChange: (l: RightsLens) => void;
  counts: Record<MapClass, number>;
  activeClass: MapClass | null;
  onActiveClassChange: (c: MapClass | null) => void;
  /** Render the legend inline. The page renders it under the map instead. */
  showLegend?: boolean;
}

interface RightsMapLegendProps {
  counts: Record<MapClass, number>;
  activeClass: MapClass | null;
  onActiveClassChange: (c: MapClass | null) => void;
}

/**
 * The route-strip legend: one station per class that has countries, ordered
 * most-restrictive → most-protective, each carrying its count. Clicking a
 * station filters the map to that class; clicking it again clears.
 */
export function RightsMapLegend({
  counts,
  activeClass,
  onActiveClassChange,
}: RightsMapLegendProps) {
  const { t } = useTranslation();
  return (
    <ol
      // Scrolls, never wraps. At 390px seven classes at ~146px each wrapped to
      // four rows of ~88px — ~420px, which made this legend the tallest single
      // block on the page, taller than the filters and taller than the map's
      // own controls. One line costs ~92px.
      //
      // MAP_CLASS_ORDER is most-restrictive-first, so what scrolls off the
      // right on a phone is "Protected" and "No data" — not the death classes.
      // That is the correct end to lose on this page, and it is a consequence
      // of the order, so it is stated here rather than discovered later.
      className="-mx-1 flex items-end gap-4 overflow-x-auto px-1 pb-1 scrollbar-thin"
      aria-label={t('rights.map.legend', 'Country counts by status')}
    >
      {MAP_CLASS_ORDER.filter((cls) => counts[cls] > 0).map((cls) => {
        const isActive = activeClass === cls;
        return (
          <li key={cls} className="shrink-0">
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onActiveClassChange(isActive ? null : cls)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-element px-2 py-1',
                isActive && 'bg-muted',
              )}
            >
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 shrink-0 rounded-badge border border-border-hairline"
                style={legendSwatchStyle(cls)}
              />
              {/* `text-headline`, not `text-title`: rank 4 is Space Grotesk and
                  never Anton (src/test/__tests__/rankFourFace.test.ts — a
                  source scan, because the ESLint design blocks can be
                  silently replaced wholesale). The legend counts want the
                  display face, so they take the rank that carries it. */}
              <span className="font-display text-headline tabular-nums">{counts[cls]}</span>
              <span className="text-13 text-muted-foreground">
                {t(`rights.map.class.${cls}`, MAP_CLASS_LABEL[cls])}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function RightsMapControls({
  topic,
  onTopicChange,
  lens,
  onLensChange,
  counts,
  activeClass,
  onActiveClassChange,
  showLegend = true,
}: RightsMapControlsProps) {
  const { t } = useTranslation();
  const lensDisabled = topic.kind !== 'protection-matrix';
  const railRef = useRef<HTMLDivElement>(null);

  /**
   * Keep the active chip on screen — by moving the RAIL, never the page.
   *
   * At 390px the rail shows about two and a half of its 18 chips, so a reader
   * arriving on an `identity` topic would see the first family at the left edge
   * and no selection anywhere: the control would read as having none.
   *
   * This used `scrollIntoView({ block: 'nearest', inline: 'center' })`, which
   * is wrong here in a way that only shows up on a deep link. `block: 'nearest'`
   * still scrolls ANCESTORS vertically when the element is off screen, and on
   * `/rights#marriage` the rail sits ~3,900px above the target (measured on
   * prod: railTop -3877 while the ledger row sat at 178). Whether the reader
   * stayed at the row they asked for came down to whether this effect or the
   * page's hash poller wrote last — a race that failed once in a full prod run
   * and passed three times in isolation.
   *
   * Setting `scrollLeft` touches one axis of one element and cannot move the
   * document, so the race is gone rather than made less likely. Offsets come
   * from bounding rects, not `offsetLeft`, which is relative to whatever
   * `offsetParent` happens to be and would silently mis-centre if the rail ever
   * stops being the nearest positioned ancestor.
   */
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-topic="${topic.slug}"]`);
    if (!rail || !chip) return;
    const railBox = rail.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const centred = chipBox.left - railBox.left - (rail.clientWidth - chipBox.width) / 2;
    rail.scrollLeft = Math.max(0, rail.scrollLeft + centred);
  }, [topic.slug]);

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      {/* (a) Every right, one rail. The family is an inline swatch rather than
          a row of its own — see the header. `Fragment` and not a wrapping div
          so the chips stay direct flex children and the gap between a family's
          last chip and the next family's label is the same rhythm as between
          chips. */}
      <div
        ref={railRef}
        role="group"
        aria-label={t('rights.map.lineSelector', 'Rights')}
        // `scrollbar-thin`, NOT the hidden scrollbar the nav rails use
        // (RouteStrip, PickerLine). Those are navigation you scroll past; this
        // is a filter whose remaining options are the point, and with the bar
        // hidden the rail just looked clipped at the right edge on desktop.
        // PresetChips, CategoryChips and Rail all keep the bar for the same
        // reason.
        className="-mx-1 flex snap-x items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin"
      >
        {RIGHT_SECTION_ORDER.map((section) => {
          const track = SECTION_TRACK[section];
          return (
            <Fragment key={section}>
              <span className="flex shrink-0 items-center gap-2 pl-2 first:pl-0">
                <TrackSwatch track={track} />
                {/* The SHORT line name: the five full headings measure ~600px
                    inline, five chips' worth of an 18-chip rail. The full one
                    stays the accessible name of nothing here — the chips carry
                    their own names, and the ledger below prints the headings. */}
                <span className="whitespace-nowrap text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t(`country.rights.sectionShort.${section}`, RIGHT_SECTION_SHORT_LABEL[section])}
                </span>
              </span>
              {topicsInSection(section).map((stationTopic) => {
                const isActive = stationTopic.slug === topic.slug;
                return (
                  <FilterChip
                    key={stationTopic.slug}
                    active={isActive}
                    data-topic={stationTopic.slug}
                    onClick={() => onTopicChange(stationTopic)}
                    label={topicListLabel(stationTopic, t)}
                    // The active chip keeps the TRACK fill instead of
                    // FilterChip's ink plate: the track colour is this
                    // control's wayfinding and the map below is drawn in it.
                    // `className` is last into `cn`, so tailwind-merge resolves
                    // the bg/text conflict in favour of the track.
                    className={cn(
                      'whitespace-nowrap',
                      isActive &&
                        cn('border border-track-ring', TRACK_BG[track], TRACK_TEXT[track]),
                    )}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {/* (b) Who the law protects. Same rail treatment, its heading inline as
          the rail's first item rather than a line of its own.

          The buttons stay DISABLED rather than hidden for the nine topics
          recorded once for everyone: a control that vanishes takes its own
          limitation with it, and that limitation — that this law has no
          per-group reading — is exactly what a reader checking trans
          protection needs told. */}
      {/* tabIndex={0} is load-bearing, not decoration. This rail scrolls
          horizontally at 390px, and the comment above explains why the chips
          stay DISABLED rather than hidden for nine topics — but a disabled
          control is out of the tab order, so in exactly that state the rail is
          a scrollable region containing nothing focusable: reachable by mouse
          or finger, unreachable by keyboard (axe `scrollable-region-focusable`,
          serious, caught on /rights [mobile] in CI). Making the container
          itself focusable restores arrow-key scrolling precisely when the chips
          cannot. Do not remove it on the grounds that "the chips are focusable"
          — they are, only while the lens applies. */}
      <div
        role="group"
        tabIndex={0}
        aria-label={t('rights.map.lens.heading', 'Who the law protects')}
        className="-mx-1 flex snap-x items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin"
      >
        <span className="shrink-0 whitespace-nowrap text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t('rights.map.lens.heading', 'Who the law protects')}
        </span>
        {LENS_OPTIONS.map((option) => (
          <FilterChip
            key={option.value}
            active={option.value === lens}
            // `aria-disabled`, NOT `disabled`. Two reasons, and the first is a
            // measured a11y failure: a `disabled` button is not focusable, so
            // on mobile — where this rail scrolls — the scrollable region held
            // no focusable content at all and a keyboard user could not reach
            // it (axe `scrollable-region-focusable`, serious, caught on
            // /rights [mobile/light]).
            //
            // The second is the point of keeping these visible in the first
            // place. `disabled` also drops them out of tab order, so a screen
            // reader user tabbing the page would never learn the lens exists
            // for this law — the exact limitation this control is here to
            // state. Dimmed-but-reachable announces "Gender identity,
            // unavailable" and the sentence below explains why.
            aria-disabled={lensDisabled || undefined}
            onClick={lensDisabled ? undefined : () => onLensChange(option.value)}
            label={t(`rights.map.lens.${option.value}`, option.label)}
            className={cn(
              'whitespace-nowrap',
              lensDisabled && 'opacity-50 hover:bg-background hover:text-foreground',
            )}
          />
        ))}
      </div>
      {/* The reason sits UNDER the rail, not inside it: at 390px a rail item
          scrolls, and a reason you have to scroll sideways to find is reachable
          rather than visible. */}
      {lensDisabled ? (
        <p className="text-13 text-muted-foreground">
          {t(
            'rights.map.lens.disabledNote',
            'This law is recorded once for everyone — no per-group reading exists.',
          )}
        </p>
      ) : null}

      {/* (c) Route-strip legend.
          Rendered here by default so this component stays self-contained, but
          the page passes `showLegend={false}` and places <RightsMapLegend/>
          BELOW the canvas: the legend reads the map back as counts, and three
          stacked control blocks above it pushed the map itself off a 900px
          viewport entirely. */}
      {showLegend ? (
        <RightsMapLegend
          counts={counts}
          activeClass={activeClass}
          onActiveClassChange={onActiveClassChange}
        />
      ) : null}
    </div>
  );
}

/**
 * Swatch fill: ink at `MAP_CLASS_INK[cls]` for every class except the two
 * criminal-exposure-with-death classes (`--destructive`) and `nodata` (a
 * diagonal hairline hatch — no-data is never a fill, per the design doc's
 * §1 rule that a gap must never look like safety). `repeating-linear-
 * gradient` in a `style` prop is CSS, not a Tailwind `bg-gradient-to-*`
 * class, so it does not trip the JSX gradient ban.
 */
function legendSwatchStyle(cls: MapClass): CSSProperties {
  if (cls === 'nodata') {
    return {
      backgroundColor: 'hsl(var(--card))',
      backgroundImage:
        'repeating-linear-gradient(45deg, hsl(var(--foreground) / 0.35) 0, hsl(var(--foreground) / 0.35) 1px, transparent 1px, transparent 6px)',
    };
  }
  if (cls === 'deathPossible') {
    return {
      backgroundColor: 'hsl(var(--destructive))',
      backgroundImage:
        'repeating-linear-gradient(45deg, hsl(var(--destructive-foreground) / 0.45) 0, hsl(var(--destructive-foreground) / 0.45) 1px, transparent 1px, transparent 6px)',
    };
  }
  if (cls === 'death') {
    return { backgroundColor: 'hsl(var(--destructive))' };
  }
  return { backgroundColor: `hsl(var(--foreground) / ${MAP_CLASS_INK[cls]})` };
}

export default RightsMapControls;
