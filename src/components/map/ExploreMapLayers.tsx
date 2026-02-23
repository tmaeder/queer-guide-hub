import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import {
  MapPin,
  Calendar,
  Building2,
  Globe,
  Accessibility,
  Hotel,
  Landmark,
} from 'lucide-react';
import type { LayerType } from '@/hooks/useExploreMapData';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';

// ── Layer definitions ──────────────────────────────────────────────────────────

/** Layer types rendered as translucent area circles (not point pins) */
const AREA_TYPES: LayerType[] = ['cities', 'countries', 'neighbourhoods'];

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
  { type: 'neighbourhoods', label: 'Neighbourhoods', icon: Landmark, defaultOn: false, comingSoon: true },
];

// ── Component ──────────────────────────────────────────────────────────────────

interface ExploreMapLayersProps {
  enabledLayers: LayerType[];
  onToggle: (layer: LayerType) => void;
  layerCounts: Record<LayerType, number>;
}

export const ExploreMapLayers: React.FC<ExploreMapLayersProps> = ({
  enabledLayers,
  onToggle,
  layerCounts,
}) => {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        bgcolor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)',
        borderRadius: 2,
        p: 1.5,
        minWidth: 180,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block', color: '#374151' }}>
        Layers
      </Typography>
      {LAYER_DEFS.map(({ type, label, icon: Icon, comingSoon }) => {
        const enabled = enabledLayers.includes(type);
        const count = layerCounts[type];
        const color = LAYER_COLORS[type];

        return (
          <Box
            key={type}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              py: 0.25,
              opacity: comingSoon ? 0.5 : 1,
            }}
          >
            {/* Area layers: filled circle indicator; Point layers: icon only */}
            {AREA_TYPES.includes(type) ? (
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  bgcolor: color,
                  opacity: 0.35,
                  border: `2px solid ${color}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <Icon size={14} color={color} />
            )}
            <Typography
              variant="body2"
              sx={{ flex: 1, fontSize: '0.8rem', color: '#374151', lineHeight: 1.2 }}
            >
              {label}
            </Typography>
            {comingSoon ? (
              <Chip label="Soon" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
            ) : (
              <>
                {enabled && count > 0 && (
                  <Chip
                    label={count}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.65rem',
                      bgcolor: color,
                      color: '#fff',
                      fontWeight: 600,
                    }}
                  />
                )}
                <Switch
                  checked={enabled}
                  onChange={() => onToggle(type)}
                  size="small"
                  disabled={comingSoon}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: color },
                  }}
                />
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default ExploreMapLayers;
