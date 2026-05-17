import React from 'react';
import { MapPin, Activity, Route, Hexagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTrigger } from '@/hooks/useHaptics';
import { LENS_LABELS, type MapLens } from './MapShell.types';

const LENS_ICONS: Record<MapLens, React.ElementType> = {
  pins: MapPin,
  density: Activity,
  routes: Route,
  boundary: Hexagon,
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
      className={cn('inline-flex items-stretch border border-border', className)}
    >
      {lenses.map((lens, i) => {
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
              'inline-flex items-center justify-center h-9 w-9 transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              i > 0 && 'border-l border-border',
              active
                ? 'bg-foreground text-background'
                : 'bg-background text-foreground hover:bg-muted',
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
