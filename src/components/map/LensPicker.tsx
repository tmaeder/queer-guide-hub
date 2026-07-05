import React from 'react';
import { MapPin, Flame, Route, Hexagon, Blend } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  /** Render text labels next to the icons (full-width segmented row — used
   *  inside the mobile controls sheet). Icon-only otherwise. */
  showLabels?: boolean;
  className?: string;
}

/**
 * Monochrome lens picker. Renders one square button per available lens;
 * active lens is inverted (foreground bg + background fg).
 */
export const LensPicker = ({ lenses, value, onChange, showLabels, className }: LensPickerProps) => {
  const { t } = useTranslation();
  if (lenses.length < 2) return null;
  return (
    <div
      role="radiogroup"
      aria-label={t('map.lens.groupLabel', { defaultValue: 'Map view' })}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-element bg-muted p-0.5',
        showLabels && 'flex w-full',
        className,
      )}
    >
      {lenses.map((lens) => {
        const Icon = LENS_ICONS[lens];
        const active = lens === value;
        const label = t(`map.lens.${lens}`, { defaultValue: LENS_LABELS[lens] });
        return (
          <button
            key={lens}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => {
              hapticTrigger('nudge');
              onChange(lens);
            }}
            className={cn(
              'inline-flex items-center justify-center rounded-badge transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              showLabels ? 'h-9 flex-1 gap-1.5 px-2 text-13' : 'h-7 w-7',
              active
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {showLabels && <span className="truncate">{label}</span>}
          </button>
        );
      })}
    </div>
  );
};

export default LensPicker;
