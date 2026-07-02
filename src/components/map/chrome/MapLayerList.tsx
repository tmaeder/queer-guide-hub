import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { hapticTrigger } from '@/hooks/useHaptics';
import type { LayerType } from '@/hooks/useExploreMapData';
import { LAYER_DEFS } from '../ExploreMapLayers';

export interface MapLayerListProps {
  availableLayers: LayerType[];
  enabledLayers: LayerType[];
  onLayersChange: (layers: LayerType[]) => void;
}

/**
 * Layer checkbox list — shared by the desktop Layers popover and the mobile
 * controls sheet.
 */
export const MapLayerList = ({
  availableLayers,
  enabledLayers,
  onLayersChange,
}: MapLayerListProps) => {
  const { t } = useTranslation();

  const toggleLayer = (l: LayerType) => {
    hapticTrigger('nudge');
    const next = enabledLayers.includes(l)
      ? enabledLayers.filter((x) => x !== l)
      : [...enabledLayers, l];
    onLayersChange(next);
  };

  return (
    <div className="flex flex-col gap-0.5">
      {LAYER_DEFS.filter((d) => availableLayers.includes(d.type) && !d.comingSoon).map((d) => {
        const checked = enabledLayers.includes(d.type);
        const label = t(`map.layers.${d.type}`, { defaultValue: d.label });
        return (
          <label
            key={d.type}
            className="flex items-center gap-2 h-9 px-2 rounded-element text-sm hover:bg-muted cursor-pointer"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => toggleLayer(d.type)}
              aria-label={label}
            />
            <span className="flex-1">{label}</span>
          </label>
        );
      })}
    </div>
  );
};

export default MapLayerList;
