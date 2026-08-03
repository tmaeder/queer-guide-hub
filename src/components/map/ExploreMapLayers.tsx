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
        className="rounded-container bg-background/85 backdrop-blur-md hover:bg-background h-10 w-10 p-0"
      >
        <Layers size={18} />
      </Button>

      {/* Chip grid */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleContent>
          <div className="flex flex-wrap gap-1.5 max-w-[240px] rounded-container bg-background/85 backdrop-blur-md p-2">
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
                  className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-full transition-all focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    fontWeight: enabled ? 600 : 400,
                    // Active: monochrome fill (foreground/background) so the label
                    // always clears WCAG AA regardless of the layer hue — pairing
                    // white/dark text with an arbitrary functional LAYER_COLOR
                    // failed contrast for several layers per theme.
                    //
                    // The chip is a plate, not an outline (border budget, see
                    // e2e/design-system.spec.ts). The layer hue used to ride on
                    // the border; it now rides on the dot below, so the chip
                    // still keys to its map pins. Inactive chips get a surface
                    // plate rather than a hairline.
                    //
                    // Measured: on this foreground fill the dot reads BETTER
                    // than the old border did on the panel for 6 of 7 layers
                    // (restrooms 2.54 -> 7.80, hotels 2.15 -> 9.22 — the border
                    // was under the 3:1 bar for both). The exception is
                    // `neighbourhoods`, which is deliberately foreground-
                    // coloured ("concrete"), so its dot would sit at 1.00:1 on
                    // this fill. That layer has no hue to key to, so it gets no
                    // dot at all rather than an invisible one.
                    backgroundColor: enabled
                      ? 'hsl(var(--foreground))'
                      : 'hsl(var(--surface-container))',
                    color: enabled ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
                    outlineColor: color,
                  }}
                >
                  {enabled && color !== LAYER_COLORS.neighbourhoods && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <Icon size={13} style={{ color: enabled ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))' }} />
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
