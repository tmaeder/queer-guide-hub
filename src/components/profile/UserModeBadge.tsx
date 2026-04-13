import { Heart, Users, Map, Smile, Handshake, Home } from 'lucide-react';
import Box from '@mui/material/Box';

interface UserModeBadgeProps {
  mode: string;
  size?: 'sm' | 'md' | 'lg';
}

const modeConfig = {
  dating: { icon: Heart, label: 'Looking for Love', bgcolor: 'rgba(236, 72, 153, 0.1)', color: '#db2777', borderColor: '#fbcfe8' },
  friends: { icon: Users, label: 'Making Friends', bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', borderColor: '#bfdbfe' },
  exploration: { icon: Map, label: 'Exploring', bgcolor: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', borderColor: '#bbf7d0' },
  fun: { icon: Smile, label: 'Here for Fun', bgcolor: 'rgba(234, 179, 8, 0.1)', color: '#ca8a04', borderColor: '#fef08a' },
  networking: { icon: Handshake, label: 'Networking', bgcolor: 'action.hover', color: 'text.primary', borderColor: 'divider' },
  community: { icon: Home, label: 'Building Community', bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', borderColor: '#c7d2fe' },
};

const sizeStyles = {
  sm: { fontSize: '0.75rem', px: 0.75, py: 0.25 },
  md: { fontSize: '0.875rem', px: 1, py: 0.5 },
  lg: { fontSize: '1rem', px: 1.5, py: 0.75 },
};

export function UserModeBadge({ mode, size = 'md' }: UserModeBadgeProps) {
  const config = modeConfig[mode as keyof typeof modeConfig];

  if (!config) return null;

  const sizeStyle = sizeStyles[size];

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        fontWeight: 500,
        borderRadius: 9999,
        bgcolor: config.bgcolor,
        color: config.color,
        ...sizeStyle,
      }}
    >
      <config.icon style={{ width: 12, height: 12 }} />
      <span>{config.label}</span>
    </Box>
  );
}
