import { useLocation, Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { Luggage, X, ChevronRight } from 'lucide-react';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { getTripPhase, phaseLabel, phaseStatusText } from './tripPhase';

/**
 * Routes where the bar is suppressed — already inside trip context, admin shell,
 * or auth flow.
 */
const HIDDEN_PREFIXES = ['/trips', '/admin', '/auth', '/onboarding'];

/**
 * Slim sticky banner that surfaces the user's active trip across the app.
 * Renders nothing when:
 *   - user has no trips,
 *   - user dismissed the bar for the current active trip,
 *   - current route already lives inside the trip context.
 */
export function TripContextBar() {
  const { pathname } = useLocation();
  const { activeTrip, isDismissed, dismiss } = useActiveTrip();

  if (!activeTrip || isDismissed) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const phase = getTripPhase(activeTrip);
  const status = phaseStatusText(activeTrip);

  return (
    <Box
      role="region"
      aria-label="Active trip context"
      sx={(theme) => ({
        position: 'sticky',
        top: 0,
        zIndex: theme.zIndex.appBar - 1,
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,115,134,0.08)' : 'rgba(182,13,61,0.06)',
        borderBottom: `1px solid ${theme.palette.divider}`,
        px: { xs: 2, sm: 3 },
        py: 0.75,
      })}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          maxWidth: 1400,
          mx: 'auto',
          minHeight: 28,
        }}
      >
        <Luggage style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.7 }} aria-hidden />
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {activeTrip.title}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            opacity: 0.7,
            display: { xs: 'none', sm: 'inline' },
            flexShrink: 0,
          }}
        >
          · {phaseLabel(phase)} · {status}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography
          component={RouterLink}
          to={`/trips/${activeTrip.id}`}
          variant="body2"
          sx={{
            color: 'primary.main',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.25,
            opacity: 1,
            transition: 'opacity 120ms',
            '&:hover': { opacity: 0.85 },
            '&:active': { opacity: 0.7 },
            flexShrink: 0,
          }}
        >
          Open trip
          <ChevronRight style={{ width: 14, height: 14 }} aria-hidden />
        </Typography>
        <IconButton
          aria-label="Dismiss trip context bar"
          size="small"
          onClick={dismiss}
          sx={{ p: 0.25, ml: 0.5 }}
        >
          <X style={{ width: 14, height: 14 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
