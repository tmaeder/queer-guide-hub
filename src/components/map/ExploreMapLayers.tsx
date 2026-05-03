import React, { useState } from 'react';
import { MapPin, Calendar, Building2, Globe, Accessibility, Hotel, Landmark, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LayerType } from '@/hooks/useExploreMapData';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';
import { hapticTrigger } from '@/hooks/useHaptics';

/** Layers rendered as translucent area circles (not point pins) */
// eslint-disable-next-line react-refresh/only-export-components
export const AREA_TYPES: LayerType[] = ['cities', 'countries', 'neighbourhoods'];

interface LayerDef {
  type: LayerType;
  label: string;
  icon: React.ElementType;
  defaultOn: boolean;
  comingSoon?: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const LAYER_DEFS: LayerDef[] = [
  { type: 'venues', label: 'Venues', icon: MapPin, defaultOn: true },
  { type: 'events', label: 'Events', icon: Calendar, defaultOn: true },
  { type: 'cities', label: 'Cities', icon: Building2, defaultOn: false },
  { type: 'countries', label: 'Countries', icon: Globe, defaultOn: false },
  { type: 'restrooms', label: 'Restrooms', icon: Accessibility, defaultOn: false },
  { type: 'hotels', label: 'Hotels', icon: Hotel, defaultOn: true },
  { type: 'neighbourhoods', label: 'Villages', icon: Landmark, defaultOn: false },
];

interface ExploreMapLayersProps {
  enabledLayers: LayerType[];
  onToggle: (layer: LayerType) => void;
  layerCounts: Record<LayerType, number>;
  compact?: boolean;
}

export const ExploreMapLayers: React.FC<ExploreMapLayersProps> = ({
  enabledLayers,
  onToggle,
  layerCounts,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(!compact);

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
      {/* Toggle button */}
      <Button
        variant="outline"
        size="sm"
        aria-label={expanded ? 'Hide map layers' : 'Show map layers'}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="bg-background hover:bg-background h-9 w-9 p-0"
      >
        <Layers size={18} />
      </Button>

      {/* Chip grid */}
      {expanded && (
        <div className="flex flex-wrap gap-1 max-w-[220px] bg-background p-1.5 rounded">
          {LAYER_DEFS.map(({ type, label, icon: Icon, comingSoon }) => {
            const enabled = enabledLayers.includes(type);
            const count = layerCounts[type];
            const color = LAYER_COLORS[type];

            if (comingSoon) return null;

            return (
              <button
                key={type}
                type="button"
                onClick={() => { hapticTrigger('nudge'); onToggle(type); }}
                className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-full border transition-colors"
                style={{
                  fontWeight: enabled ? 600 : 400,
                  backgroundColor: enabled ? `${color}18` : 'transparent',
                  color: enabled ? color : 'var(--muted-foreground)',
                  borderColor: enabled ? color : 'var(--border)',
                }}
              >
                <Icon size={13} />
                {label}{enabled && count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExploreMapLayers;
