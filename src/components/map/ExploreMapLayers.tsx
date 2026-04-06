import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import { MapPin, Calendar, Building2, Globe, Accessibility, Hotel, Landmark, Layers } from 'lucide-react';
import type { LayerType } from '@/hooks/useExploreMapData';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';
import { hapticTrigger } from '@/hooks/useHaptics';

/** Layers rendered as translucent area circles (not point pins) */
export const AREA_TYPES: LayerType[] = ['cities', 'countries', 'neighbourhoods'];

interface LayerDef {
  type: LayerType;
  label: string;
  icon: React.ElementType;
  defaultOn: boolean;
  comingSoon?: boolean;
}

export const LAYER_DEFS: LayerDef[] = [
  { type: 'venues', label: 'Venues', icon: MapPin, defaultOn: true },
  { type: 'events', label: 'Events', icon: Calendar, defaultOn: true },
  { type: 'cities', label: 'Cities', icon: Building2, defaultOn: false },
  { type: 'countries', label: 'Countries', icon: Globe, defaultOn: false },
  { type: 'restrooms', label: 'Restrooms', icon: Accessibility, defaultOn: false },
  { type: 'hotels', label: 'Hotels', icon: Hotel, defaultOn: false, comingSoon: true },
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
    <Box
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      {/* Toggle button */}
      <IconButton
        size="small"
        onClick={() => setExpanded((v) => !v)}
        sx={{
          bgcolor: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          width: 36,
          height: 36,
          '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
        }}
      >
        <Layers size={18} />
      </IconButton>

      {/* Chip grid */}
      <Collapse in={expanded}>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            maxWidth: 220,
            bgcolor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: 2,
            p: 0.75,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {LAYER_DEFS.map(({ type, label, icon: Icon, comingSoon }) => {
            const enabled = enabledLayers.includes(type);
            const count = layerCounts[type];
            const color = LAYER_COLORS[type];

            if (comingSoon) return null;

            return (
              <Chip
                key={type}
                icon={<Icon size={13} />}
                label={`${label}${enabled && count > 0 ? ` (${count})` : ''}`}
                size="small"
                variant={enabled ? 'filled' : 'outlined'}
                onClick={() => { hapticTrigger('nudge'); onToggle(type); }}
                sx={{
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: enabled ? 600 : 400,
                  bgcolor: enabled ? `${color}18` : 'transparent',
                  color: enabled ? color : '#64748b',
                  borderColor: enabled ? color : '#cbd5e1',
                  '& .MuiChip-icon': { color: enabled ? color : '#94a3b8' },
                  '&:hover': {
                    bgcolor: `${color}25`,
                    borderColor: color,
                  },
                  transition: 'all 150ms',
                }}
              />
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
};

export default ExploreMapLayers;
