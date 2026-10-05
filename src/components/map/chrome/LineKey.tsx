import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { hapticTrigger } from '@/hooks/useHaptics';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { TRACK_BG } from '@/components/transit/routeBulletMap';
import { monoHeatStops, type LayerType } from '@/hooks/useExploreMapData';
import { AREA_LAYERS, LAYER_DEFS } from '@/config/mapLayers';
import { iconForMarker } from '../mapIcons';
import {
  MAP_LINES,
  areaColor,
  lineColor,
  lineTrack,
  type MapLine,
  type MapView,
} from '../mapDomain';
import { LINE_LABELS } from '../MapShell.types';

const AREA_LABEL: Record<string, string> = Object.fromEntries(
  LAYER_DEFS.map((d) => [d.type, d.label]),
);

export interface LineKeyProps {
  /** Lines this surface offers at all (the preset). */
  availableLines: MapLine[];
  /** Lines currently drawn. */
  lines: MapLine[];
  onLinesChange: (next: MapLine[]) => void;
  /** Live per-line counts from the points in view; omit for none. */
  counts?: Partial<Record<MapLine, number>>;
  /** Area layers the current view draws. Rendered as a LEGEND, not toggles. */
  areaLayers?: LayerType[];
  view: MapView;
  className?: string;
}

/**
 * The line key — one surface that both NAMES the lines and SWITCHES them.
 *
 * It replaces two components that were each half of the idea: `MapLayerList`
 * (checkboxes with no colour, so nothing connected "Venues" to the pink pins
 * on the canvas) and `MapLegend` (colours with no toggle, so the thing that
 * explained the map couldn't change it). Splitting a transit map's key from
 * its controls is the kind of thing that only makes sense to whoever built the
 * popovers; to a reader they are one question — "what am I looking at, and can
 * I see less of it?"
 *
 * Row anatomy, left to right: route bullet (M / E / C / T) · a length of that
 * line's track · the station glyph · the line's name · how many are in view.
 * Toggled off, the track goes hollow and the row dims — the line is still
 * listed, because a key that hides what you turned off can't tell you what
 * you're missing.
 *
 * **Geography is NOT a line.** The area layers used to sit in this same list as
 * toggles, which made `cities` look like a sibling of `venues`; under the
 * `areas` view they render as a read-only LEGEND instead. A toggle for
 * something no line draws is a control that does nothing — which is what the
 * `areas` entry was on every other view.
 */
export function LineKey({
  availableLines,
  lines,
  onLinesChange,
  counts,
  areaLayers,
  view,
  className,
}: LineKeyProps) {
  const { t } = useTranslation();
  const rows = availableLines;

  // Heat has no pins to key; areas has no point symbols to explain.
  const showPins = view === 'stations' || view === 'routes';
  const showHeat = view === 'heat' || view === 'stations';
  const showAreas = view === 'areas' && (areaLayers?.length ?? 0) > 0;

  const toggle = (line: MapLine) => {
    hapticTrigger('nudge');
    onLinesChange(
      lines.includes(line) ? lines.filter((l) => l !== line) : [...lines, line],
    );
  };

  const renderRow = (line: MapLine) => {
    const def = MAP_LINES[line];
    const on = lines.includes(line);
    const track = lineTrack(line);
    const count = counts?.[line];
    const label = t(`map.lines.${line}`, { defaultValue: LINE_LABELS[line] });
    // The line's primary fetch layer picks the station glyph — the same one
    // the pins on the canvas carry.
    const glyphLayer = def.fetchLayers[0];

    return (
      <li key={line}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => toggle(line)}
          className={cn(
            'flex w-full items-center gap-2 px-2 py-1.5 text-left text-13 transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
            on ? 'text-foreground hover:bg-muted' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {/* Route bullet — the line letter, in the line's own track colour. */}
          <span
            aria-hidden
            className={cn(
              'grid h-5 w-5 shrink-0 place-items-center rounded-full border border-track-ring text-2xs font-bold',
              on ? TRACK_BG[track] : 'bg-background',
              on ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {def.letter}
          </span>

          {/* A length of the line itself. Hollow when the line is off. */}
          <span aria-hidden className="relative flex h-4 w-6 shrink-0 items-center">
            <span
              className="h-1.5 w-full border-y border-track-ring"
              style={on ? { backgroundColor: lineColor(line) } : undefined}
            />
          </span>

          <TransitIcon name={iconForMarker(glyphLayer)} size={16} />
          <span className="min-w-0 flex-1 truncate">{label}</span>

          {count != null && count > 0 && (
            <span className="shrink-0 tabular-nums text-xs2 text-muted-foreground">{count}</span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {rows.length > 0 && (
        <>
          <p className="px-2 pb-1 text-2xs uppercase tracking-wider text-muted-foreground">
            {t('map.key.lines', { defaultValue: 'Lines' })}
          </p>
          <ul className="flex flex-col">{rows.map(renderRow)}</ul>
        </>
      )}

      {showAreas && (
        <>
          <p className="mt-2 border-t border-border-hairline px-2 pb-1 pt-2 text-2xs uppercase tracking-wider text-muted-foreground">
            {t('map.key.areas', { defaultValue: 'Areas' })}
          </p>
          <ul className="flex flex-col">
            {areaLayers
              ?.filter((l) => AREA_LAYERS.includes(l))
              .map((l) => (
                <li
                  key={l}
                  className="flex items-center gap-2 px-2 py-1.5 text-13 text-foreground"
                >
                  {/* Ink, not a track colour — an area is ground, not a route. */}
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full border border-border-hairline"
                    style={{ backgroundColor: areaColor(0.3) }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`map.layers.${l}`, { defaultValue: AREA_LABEL[l] ?? l })}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}

      {(showPins || showHeat) && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border-hairline px-2 pt-2">
          {showPins && (
            <>
              <p className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-border-hairline"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                </span>
                {t('map.key.featured', { defaultValue: 'Double ring = featured' })}
              </p>
              <p className="flex items-center gap-2 text-2xs text-muted-foreground">
                <TransitIcon name="alerts" size={14} />
                {t('map.key.live', { defaultValue: 'Pulsing = open now / live' })}
              </p>
              {/* The label is what satisfies WCAG 1.4.1 for the saved badge:
                  the badge is a glyph, and this names it. */}
              <p className="flex items-center gap-2 text-2xs text-muted-foreground">
                <TransitIcon name="saved" size={14} />
                {t('map.key.saved', { defaultValue: 'Badge = saved by you' })}
              </p>
            </>
          )}

          {showHeat && (
            <div>
              <p className="mb-1 text-2xs text-muted-foreground">
                {t('map.key.density', { defaultValue: 'Density of queer life' })}
              </p>
              <div
                aria-hidden
                className="h-2 w-full border border-border-hairline"
                style={{
                  backgroundImage: `linear-gradient(to right, ${monoHeatStops()
                    .map(([, c]) => c)
                    .join(', ')})`,
                }}
              />
              <div className="mt-1 flex justify-between text-3xs text-muted-foreground">
                <span>{t('map.key.fewer', { defaultValue: 'Fewer' })}</span>
                <span>{t('map.key.more', { defaultValue: 'More' })}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LineKey;
