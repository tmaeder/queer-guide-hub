import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { Link as RouterLink } from 'react-router-dom';
import {
  Bell,
  X,
  Calendar,
  Newspaper,
  Clock,
  AlertTriangle,
  CloudRain,
  FileWarning,
} from 'lucide-react';
import { useTripNudges, useDismissTripNudge, type TripNudge } from '@/hooks/useTripNudges';

interface Props {
  tripId: string;
}

const KIND_ICON: Record<TripNudge['kind'], typeof Bell> = {
  event_overlap: Calendar,
  news_alert: Newspaper,
  booking_reminder: Clock,
  weather_warning: CloudRain,
  document_expiry: FileWarning,
};

/**
 * Slim stack of actionable nudge cards at the top of the trip
 * planner. Hidden when there are no active nudges. Each card
 * shows an icon, title, body, optional CTA, and a dismiss button.
 */
export function TripNudgesBanner({ tripId }: Props) {
  const { data: nudges, isLoading } = useTripNudges(tripId);
  const dismiss = useDismissTripNudge();

  if (isLoading || !nudges || nudges.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
      {nudges.map((n) => {
        const Icon = KIND_ICON[n.kind] ?? Bell;
        const tone =
          n.severity === 'critical'
            ? { bg: 'rgba(220, 38, 38, 0.08)', fg: '#dc2626' }
            : n.severity === 'warning'
              ? { bg: 'rgba(217, 119, 6, 0.08)', fg: '#b45309' }
              : { bg: 'action.hover', fg: 'text.primary' };

        return (
          <Box
            key={n.id}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.25,
              p: 1.5,
              bgcolor: tone.bg,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', color: tone.fg, mt: 0.25 }}>
              {n.severity === 'critical' ? <AlertTriangle size={16} /> : <Icon size={16} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {n.title}
              </Typography>
              {n.body && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.25 }}
                >
                  {n.body}
                </Typography>
              )}
              {n.action_url && n.action_label && (
                <Box
                  component={n.action_url.startsWith('/') ? RouterLink : 'a'}
                  to={n.action_url.startsWith('/') ? n.action_url : undefined}
                  href={!n.action_url.startsWith('/') ? n.action_url : undefined}
                  target={!n.action_url.startsWith('/') ? '_blank' : undefined}
                  rel={!n.action_url.startsWith('/') ? 'noopener noreferrer' : undefined}
                  sx={{
                    display: 'inline-block',
                    mt: 0.75,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'brand.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  {n.action_label} →
                </Box>
              )}
            </Box>
            <IconButton
              size="small"
              onClick={() => dismiss.mutate({ id: n.id, tripId })}
              disabled={dismiss.isPending}
              aria-label="Dismiss"
              sx={{ p: 0.5 }}
            >
              <X size={14} />
            </IconButton>
          </Box>
        );
      })}
    </Box>
  );
}
