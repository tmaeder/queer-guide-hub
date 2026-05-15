import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { MapPin, Calendar, Building2, Globe, Accessibility, Hotel, Landmark, Layers } from 'lucide-react';
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

export const ExploreMapLayers = ({
  enabledLayers,
  onToggle,
  layerCounts,
  compact = false,
}: ExploreMapLayersProps) => {
  const [expanded, setExpanded] = useState(!compact);

  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={expanded ? 'Hide map layers' : 'Show map layers'}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="rounded-container border border-border bg-background/85 backdrop-blur-md shadow-md hover:bg-background h-10 w-10 p-0"
      >
        <Layers size={18} />
      </Button>

      {/* Chip grid */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleContent>
          <div className="flex flex-wrap gap-1.5 max-w-[240px] rounded-container border border-border bg-background/85 backdrop-blur-md shadow-md p-2">
            {LAYER_DEFS.map(({ type, label, icon: Icon, comingSoon }) => {
              const enabled = enabledLayers.includes(type);
              const count = layerCounts[type];
              const color = LAYER_COLORS[type];

              if (comingSoon) return null;

              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={enabled}
                  aria-label={`${label}${enabled && count > 0 ? `, ${count} visible` : ''}`}
                  onClick={() => { hapticTrigger('nudge'); onToggle(type); }}
                  className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-full border transition-all focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    fontWeight: enabled ? 600 : 400,
                    // Active: opaque brand pill with white text — meets WCAG AA
                    // (≥4.5:1) against panel bg for all 7 layer colors,
                    // including amber Hotels which fails the prior tint approach.
                    backgroundColor: enabled ? color : 'transparent',
                    color: enabled ? '#ffffff' : 'hsl(var(--muted-foreground))',
                    borderColor: enabled ? color : 'hsl(var(--border))',
                    outlineColor: color,
                  }}
                >
                  <Icon size={13} style={{ color: enabled ? '#ffffff' : 'hsl(var(--muted-foreground))' }} />
                  {`${label}${enabled && count > 0 ? ` (${count})` : ''}`}
                </button>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default ExploreMapLayers;
