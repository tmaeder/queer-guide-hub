import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Info, X, Star, Radio } from 'lucide-react';
import { tweens } from '@/lib/motion';
import { distance } from '@/lib/animation';
import {
  LAYER_COLORS,
  type LayerType,
} from '@/hooks/useExploreMapData';
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

/**
 * Compact, collapsible key for the map. Explains what each colored pin means,
 * the featured / live treatments, and (for the density + combined lenses) what
 * the heat field encodes. Previously the map had no legend at all.
 */
export function MapLegend({ lens, layers, raised }: MapLegendProps) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const palette = LAYER_COLORS;
  const showHeat = lens === 'density' || lens === 'combined';
  const showPins = lens !== 'density' && lens !== 'boundary';
  // The collapsed button sits low; when the rail (~170px tall) is present, lift
  // the legend fully above it so it stays reachable on full-width mobile rails.
  const bottomClass = raised ? 'bottom-48' : 'bottom-10';

  return (
    <AnimatePresence initial={false} mode="wait">
    {!open ? (
      <motion.button
        key="btn"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show map legend"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduced ? { duration: 0 } : tweens.fast}
        className={`absolute ${bottomClass} left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-4 py-1.5 text-13 text-foreground backdrop-blur-md hover:bg-background`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
        Legend
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
        <span className="text-13 font-semibold text-foreground">What you're seeing</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide map legend"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {showPins && (
        <ul className="flex flex-col gap-2">
          {layers.map((type) => {
            const Icon = iconForMarker(type);
            return (
              <li key={type} className="flex items-center gap-2 text-13 text-foreground">
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: palette[type] ?? '#888' }}
                  aria-hidden
                />
                <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="truncate">{LABEL[type] ?? type}</span>
              </li>
            );
          })}
        </ul>
      )}

      {showPins && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <Star className="h-3.5 w-3.5" aria-hidden />
            Ringed = featured spot
          </div>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5" aria-hidden />
            Pulsing = open now / live
          </div>
        </div>
      )}

      {showHeat && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1 text-2xs text-muted-foreground">Density of queer life</div>
          <div
            className="h-2 w-full rounded-badge"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0.55))',
            }}
            aria-hidden
          />
          <div className="mt-1.5 flex justify-between text-3xs text-muted-foreground">
            <span>Fewer</span>
            <span>More</span>
          </div>
        </div>
      )}
    </motion.div>
    )}
    </AnimatePresence>
  );
}

export default MapLegend;
