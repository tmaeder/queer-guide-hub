import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import { Calendar } from 'lucide-react';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import type { TripWithDetails } from '@/hooks/useTrips';
import { resolveTripTitle } from './tripTitle';

interface Props {
  trip: TripWithDetails;
  dateRange: string | null;
  statusLabel: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Fallback gradient used when no cover image is set. Stable per trip via a
 * hash of the id so returning to a trip always shows the same gradient.
 */
function gradientForTrip(tripId: string): string {
  const palettes = [
    ['#7C3AED', '#DB2777'],
    ['#F59E0B', '#EF4444'],
    ['#06B6D4', '#3B82F6'],
    ['#10B981', '#6366F1'],
    ['#EC4899', '#8B5CF6'],
    ['#0EA5E9', '#22C55E'],
  ];
  let hash = 0;
  for (let i = 0; i < tripId.length; i += 1) {
    hash = (hash * 31 + tripId.charCodeAt(i)) >>> 0;
  }
  const [a, b] = palettes[hash % palettes.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function TripCoverBand({
  trip,
  dateRange,
  statusLabel,
  actions,
  children,
}: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { t } = useTranslation();
  const displayTitle = resolveTripTitle(trip, t);

  const coverImage = trip.cover_image_url;
  const fallbackGradient = gradientForTrip(trip.id);

  const overlay = isDark
    ? 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.78) 100%)'
    : 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.65) 100%)';

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 3,
        overflow: 'hidden',
        mb: 3,
        minHeight: { xs: 180, md: 220 },
        display: 'flex',
        alignItems: 'flex-end',
        background: coverImage ? undefined : fallbackGradient,
        backgroundImage: coverImage ? `url(${coverImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark gradient overlay for legibility */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          background: overlay,
          pointerEvents: 'none',
        }}
      />

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          px: { xs: 2.5, md: 4 },
          py: { xs: 2.5, md: 3 },
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
          {/* Status pill */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.25,
              py: 0.25,
              borderRadius: 999,
              bgcolor: 'rgba(255,255,255,0.18)',
              color: 'common.white',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              mb: 1.25,
            }}
          >
            <Box
              component="span"
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: 'common.white',
              }}
            />
            {statusLabel}
          </Box>

          <Typography
            variant="h3"
            sx={{
              color: 'common.white',
              fontSize: { xs: '1.75rem', md: '2.25rem' },
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              textShadow: '0 2px 16px rgba(0,0,0,0.35)',
            }}
          >
            {displayTitle}
          </Typography>

          {dateRange && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                mt: 1,
                color: 'rgba(255,255,255,0.92)',
              }}
            >
              <Calendar style={{ width: 15, height: 15 }} />
              <Typography variant="body2" sx={{ color: 'inherit' }}>
                {dateRange}
              </Typography>
            </Box>
          )}

          {trip.description && (
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255,255,255,0.82)',
                mt: 0.75,
                maxWidth: 640,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {trip.description}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
          }}
        >
          {trip.trip_members.length > 0 && (
            <AvatarGroup
              max={4}
              sx={{
                '& .MuiAvatar-root': {
                  width: 32,
                  height: 32,
                  fontSize: '0.8rem',
                  borderColor: 'rgba(255,255,255,0.6)',
                },
              }}
            >
              {trip.trip_members.map((m) => (
                <Avatar
                  key={m.id}
                  alt={m.profiles?.display_name || 'Member'}
                  src={m.profiles?.avatar_url || undefined}
                >
                  {(m.profiles?.display_name || 'U')[0].toUpperCase()}
                </Avatar>
              ))}
            </AvatarGroup>
          )}
          {children}
          {actions}
        </Box>
      </Box>
    </Box>
  );
}
