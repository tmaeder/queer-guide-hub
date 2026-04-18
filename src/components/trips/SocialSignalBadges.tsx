import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { Heart, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VenueSocialSignal } from '@/hooks/useVenueSocialSignals';

interface Props {
  signal: VenueSocialSignal | undefined;
  /** Minimum trip_usage before the "used in N trips" badge appears. */
  tripUsageThreshold?: number;
}

/**
 * Inline social-proof chips for a venue. Renders nothing when both
 * counts are below threshold — noise should stay off the UI.
 *
 * - `friends_saved > 0` → ❤ N friends
 * - `trip_usage >= threshold` → 👥 in N trips
 */
export function SocialSignalBadges({ signal, tripUsageThreshold = 3 }: Props) {
  const { t } = useTranslation();
  if (!signal) return null;
  const showFriends = signal.friends_saved > 0;
  const showTrips = signal.trip_usage >= tripUsageThreshold;
  if (!showFriends && !showTrips) return null;

  return (
    <Box sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
      {showFriends && (
        <Tooltip title={t('places.social.friendsSavedTooltip', { defaultValue: 'Saved by people you follow' })}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              px: 0.75,
              py: 0.25,
              bgcolor: 'rgba(244, 63, 94, 0.12)',
              color: '#e11d48',
              borderRadius: 0.5,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Heart size={10} fill="currentColor" />
            <Typography component="span" sx={{ fontSize: 11, fontWeight: 600 }}>
              {t('places.social.friendsSaved', {
                defaultValue: '{{count}} friend(s) saved',
                count: signal.friends_saved,
              })}
            </Typography>
          </Box>
        </Tooltip>
      )}
      {showTrips && (
        <Tooltip title={t('places.social.tripUsageTooltip', { defaultValue: 'Added to public trips' })}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              px: 0.75,
              py: 0.25,
              bgcolor: 'action.hover',
              color: 'text.secondary',
              borderRadius: 0.5,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Users size={10} />
            <Typography component="span" sx={{ fontSize: 11, fontWeight: 600 }}>
              {t('places.social.tripUsage', {
                defaultValue: 'in {{count}} trip(s)',
                count: signal.trip_usage,
              })}
            </Typography>
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}
