import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Info, X, Star, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tweens } from '@/lib/motion';
import { distance } from '@/lib/animation';
import {
  LAYER_COLORS,
  MONO_HEAT_STOPS,
  type LayerType,
} from '@/hooks/useExploreMapData';
import { AREA_LAYERS } from '@/config/mapLayers';
import { iconForMarker } from './mapIcons';
import { LAYER_DEFS } from './ExploreMapLayers';
import type { MapLens } from './MapShell.types';

interface MapLegendProps {
  lens: MapLens;
  layers: LayerType[];
  /** Lift above the spotlight rail so the two don't overlap on narrow screens. */
  raised?: boolean;
}

const LABEL: Record<string, string> = Object.fromEntries(
  LAYER_DEFS.map((d) => [d.type, d.label]),
);

// Legend gradient derives from the SAME stops as the canvas heatmap — the
// two can't drift apart.
const HEAT_GRADIENT = `linear-gradient(to right, ${MONO_HEAT_STOPS.map(([, c]) => c).join(', ')})`;

/**
 * Compact, collapsible key for the map. Explains what each colored pin means,
 * the featured / live treatments, and (for the density + combined lenses) what
 * the heat field encodes. Content follows the active lens: pin swatches only
 * when pins render, an Areas group when area circles are on, the density ramp
 * only on heat lenses.
 */
export function MapLegend({ lens, layers, raised }: MapLegendProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const palette = LAYER_COLORS;
  const showHeat = lens === 'density' || lens === 'combined';
  const showPins = lens !== 'density' && lens !== 'boundary';
  const pointLayers = layers.filter((l) => !AREA_LAYERS.includes(l));
  const areaLayers = layers.filter((l) => AREA_LAYERS.includes(l));
  // The collapsed button sits low; when the rail is present, ride the rail's
  // published clearance so the legend always sits just above it.
  const bottomClass = raised
    ? 'bottom-[calc(var(--map-rail-clearance,4.5rem)+0.5rem)]'
    : 'bottom-10';

  const layerLabel = (type: LayerType) =>
    t(`map.layers.${type}`, { defaultValue: LABEL[type] ?? type });

  const renderRows = (types: LayerType[]) => (
    <ul className="flex flex-col gap-2">
      {types.map((type) => {
        const Icon = iconForMarker(type);
        return (
          <li key={type} className="flex items-center gap-2 text-13 text-foreground">
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: palette[type] ?? '#888' }}
              aria-hidden
            />
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="truncate">{layerLabel(type)}</span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <AnimatePresence initial={false} mode="wait">
    {!open ? (
      <motion.button
        key="btn"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('map.legend.show', { defaultValue: 'Show map legend' })}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduced ? { duration: 0 } : tweens.fast}
        className={`absolute ${bottomClass} left-3 z-10 inline-flex items-center gap-1.5 rounded-element border border-border bg-background/95 px-4 py-1.5 text-13 text-foreground backdrop-blur-md hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
        {t('map.legend.label', { defaultValue: 'Legend' })}
      </motion.button>
    ) : (
    <motion.div
      key="panel"
      initial={reduced ? false : { opacity: 0, scale: 0.96, y: distance.sm }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: distance.sm }}
      transition={reduced ? { duration: 0 } : tweens.fast}
      style={{ originY: 1, originX: 0 }}
      className={`absolute ${bottomClass} left-3 z-10 w-56 rounded-container border border-border bg-background/95 p-4 backdrop-blur-md`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-13 font-semibold text-foreground">
          {t('map.legend.title', { defaultValue: "What you're seeing" })}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('map.legend.hide', { defaultValue: 'Hide map legend' })}
          className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {showPins && pointLayers.length > 0 && renderRows(pointLayers)}

      {areaLayers.length > 0 && (
        <div className={showPins && pointLayers.length > 0 ? 'mt-2 border-t border-border pt-2' : ''}>
          <div className="mb-1 text-2xs text-muted-foreground">
            {t('map.legend.areas', { defaultValue: 'Areas' })}
          </div>
          {renderRows(areaLayers)}
        </div>
      )}

      {showPins && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <Star className="h-3.5 w-3.5" aria-hidden />
            {t('map.legend.featured', { defaultValue: 'Ringed = featured spot' })}
          </div>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5" aria-hidden />
            {t('map.legend.live', { defaultValue: 'Pulsing = open now / live' })}
          </div>
        </div>
      )}

      {showHeat && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1 text-2xs text-muted-foreground">
            {t('map.legend.densityTitle', { defaultValue: 'Density of queer life' })}
          </div>
          <div
            className="h-2 w-full rounded-badge"
            style={{ backgroundImage: HEAT_GRADIENT }}
            aria-hidden
          />
          <div className="mt-1.5 flex justify-between text-3xs text-muted-foreground">
            <span>{t('map.legend.fewer', { defaultValue: 'Fewer' })}</span>
            <span>{t('map.legend.more', { defaultValue: 'More' })}</span>
          </div>
        </div>
      )}
    </motion.div>
    )}
    </AnimatePresence>
  );
}

export default MapLegend;
