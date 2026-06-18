import React from 'react';
import { MapPin, Flame, Route, Hexagon, Blend } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTrigger } from '@/hooks/useHaptics';
import { LENS_LABELS, type MapLens } from './MapShell.types';

// Distinct icons per lens. `combined` must NOT reuse the Layers icon — that's
// the separate Layers control in the command bar and the two read as the same
// button. Blend = pins + density blended; Flame = heat/density.
const LENS_ICONS: Record<MapLens, React.ElementType> = {
  pins: MapPin,
  density: Flame,
  routes: Route,
  boundary: Hexagon,
  combined: Blend,
};

interface LensPickerProps {
  lenses: MapLens[];
  value: MapLens;
  onChange: (lens: MapLens) => void;
  className?: string;
}

/**
 * Monochrome lens picker. Renders one square button per available lens;
 * active lens is inverted (foreground bg + background fg).
 */
export const LensPicker = ({ lenses, value, onChange, className }: LensPickerProps) => {
  if (lenses.length < 2) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Map view"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-element bg-muted p-0.5',
        className,
      )}
    >
      {lenses.map((lens) => {
        const Icon = LENS_ICONS[lens];
        const active = lens === value;
        return (
          <button
            key={lens}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LENS_LABELS[lens]}
            title={LENS_LABELS[lens]}
            onClick={() => {
              hapticTrigger('nudge');
              onChange(lens);
            }}
            className={cn(
              'inline-flex items-center justify-center h-7 w-7 rounded-badge transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              active
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
};

export default LensPicker;
