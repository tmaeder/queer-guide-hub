import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { hapticTrigger } from '@/hooks/useHaptics';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { ROUTE_BULLET_MAP, TRACK_BG } from '@/components/transit/routeBulletMap';
import { LAYER_COLORS, monoHeatStops, type LayerType } from '@/hooks/useExploreMapData';
import { AREA_LAYERS, LAYER_DEFS } from '@/config/mapLayers';
import { iconForMarker } from '../mapIcons';
import type { MapLens } from '../MapShell.types';

/** Layer → the ROUTE_BULLET_MAP key for the same entity type. Mirrors the
 *  table in useExploreMapData so a row can show its letter. */
const BULLET_KEY: Record<LayerType, string> = {
  venues: 'venue',
  events: 'event',
  hotels: 'hotel',
  restrooms: 'restroom',
  cities: 'city',
  countries: 'country',
  neighbourhoods: 'queer_village',
};

const LABEL: Record<string, string> = Object.fromEntries(LAYER_DEFS.map((d) => [d.type, d.label]));

export interface LineKeyProps {
  /** Layers this surface offers at all (the preset). */
  availableLayers: LayerType[];
  /** Layers currently drawn. */
  enabledLayers: LayerType[];
  onLayersChange: (next: LayerType[]) => void;
  /** Live per-layer counts from the points in view; omit for none. */
  counts?: Partial<Record<LayerType, number>>;
  lens: MapLens;
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
 * Row anatomy, left to right: route bullet (the letter the same entity carries
 * everywhere else in the product) · a length of that line's track · the
 * station glyph · the line's name · how many are in view. Toggled off, the
 * track goes hollow and the row dims — the line is still listed, because a key
 * that hides what you turned off can't tell you what you're missing.
 */
export function LineKey({
  availableLayers,
  enabledLayers,
  onLayersChange,
  counts,
  lens,
  className,
}: LineKeyProps) {
  const { t } = useTranslation();
  const rows = LAYER_DEFS.filter((d) => availableLayers.includes(d.type) && !d.comingSoon);
  const pointRows = rows.filter((d) => !AREA_LAYERS.includes(d.type));
  const areaRows = rows.filter((d) => AREA_LAYERS.includes(d.type));

  // Density has no pins to key, boundary has no point symbols to explain.
  const showPins = lens !== 'density' && lens !== 'boundary';
  const showHeat = lens === 'density' || lens === 'combined';

  const toggle = (type: LayerType) => {
    hapticTrigger('nudge');
    onLayersChange(
      enabledLayers.includes(type)
        ? enabledLayers.filter((l) => l !== type)
        : [...enabledLayers, type],
    );
  };

  const renderRow = (type: LayerType) => {
    const on = enabledLayers.includes(type);
    const bullet = ROUTE_BULLET_MAP[BULLET_KEY[type]];
    const track = bullet?.track;
    const count = counts?.[type];
    const label = t(`map.layers.${type}`, { defaultValue: LABEL[type] ?? type });

    return (
      <li key={type}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => toggle(type)}
          className={cn(
            'flex w-full items-center gap-2 px-2 py-1.5 text-left text-13 transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
            on ? 'text-foreground hover:bg-muted' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {/* Route bullet — the letter this type carries product-wide. */}
          <span
            aria-hidden
            className={cn(
              'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-foreground text-2xs font-bold',
              on && track ? TRACK_BG[track] : 'bg-background',
              on ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {bullet?.letter ?? label.charAt(0)}
          </span>

          {/* A length of the line itself. Hollow when the line is off. */}
          <span aria-hidden className="relative flex h-4 w-6 shrink-0 items-center">
            <span
              className={cn('h-1.5 w-full border-y-2 border-foreground')}
              style={on ? { backgroundColor: LAYER_COLORS[type] } : undefined}
            />
          </span>

          <TransitIcon name={iconForMarker(type)} size={16} />
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
      {pointRows.length > 0 && (
        <>
          <p className="px-2 pb-1 text-2xs uppercase tracking-wider text-muted-foreground">
            {t('map.key.lines', { defaultValue: 'Lines' })}
          </p>
          <ul className="flex flex-col">{pointRows.map((d) => renderRow(d.type))}</ul>
        </>
      )}

      {areaRows.length > 0 && (
        <>
          <p className="mt-2 border-t-2 border-foreground px-2 pb-1 pt-2 text-2xs uppercase tracking-wider text-muted-foreground">
            {t('map.key.areas', { defaultValue: 'Areas' })}
          </p>
          <ul className="flex flex-col">{areaRows.map((d) => renderRow(d.type))}</ul>
        </>
      )}

      {(showPins || showHeat) && (
        <div className="mt-2 flex flex-col gap-2 border-t-2 border-foreground px-2 pt-2">
          {showPins && (
            <>
              <p className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-foreground"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                </span>
                {t('map.key.featured', { defaultValue: 'Double ring = featured' })}
              </p>
              <p className="flex items-center gap-2 text-2xs text-muted-foreground">
                <TransitIcon name="alerts" size={14} />
                {t('map.key.live', { defaultValue: 'Pulsing = open now / live' })}
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
                className="h-2 w-full border-2 border-foreground"
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
