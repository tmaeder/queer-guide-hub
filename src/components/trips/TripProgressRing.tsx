import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { TripWithDetails } from '@/hooks/useTrips';
import { computeTripProgress } from './tripProgress';

interface Props {
  trip: TripWithDetails;
  size?: number;
}

/**
 * SVG progress ring for the planner header. Solid-color only (per design
 * system rule — no gradients with alpha).
 */
export function TripProgressRing({ trip, size = 72 }: Props) {
  const theme = useTheme();
  const brand = theme.palette.brand?.main || '#DB2777';
  const divider = theme.palette.divider as string;
  const { percent } = computeTripProgress(trip);

  const strokeWidth = Math.max(4, Math.round(size / 12));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
      }}
      role="img"
      aria-label={`Trip planning ${percent}% complete`}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={divider}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={brand}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{ transition: 'stroke-dasharray 0.4s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <Typography
          sx={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700,
            fontSize: size / 4,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {percent}
        </Typography>
        <Typography
          sx={{
            fontSize: size / 8,
            color: 'text.secondary',
            lineHeight: 1,
            mt: 0.25,
          }}
        >
          %
        </Typography>
      </Box>
    </Box>
  );
}
