import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ExternalLink, MousePointerClick, Hotel, Ticket, Plane, UtensilsCrossed, Link2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTripBookingClicks, type TripBookingClick } from '@/hooks/useTripBookingClicks';

interface Props {
  tripId: string;
}

const VERTICAL_ICON: Record<TripBookingClick['vertical'], typeof Hotel> = {
  hotel: Hotel,
  activity: Ticket,
  flight: Plane,
  restaurant: UtensilsCrossed,
  other: Link2,
};

const VERTICAL_LABEL: Record<TripBookingClick['vertical'], string> = {
  hotel: 'Hotels',
  activity: 'Activities',
  flight: 'Flights',
  restaurant: 'Dining',
  other: 'Other',
};

/**
 * Owner/editor-only summary of affiliate-link click activity on a
 * trip. Hidden entirely for non-editors (RLS returns empty) and when
 * there are no clicks yet.
 */
export function BookingActivitySection({ tripId }: Props) {
  const { data, isLoading } = useTripBookingClicks(tripId);

  if (isLoading || !data || data.total === 0) return null;

  const verticalEntries = (Object.entries(data.byVertical) as [TripBookingClick['vertical'], number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          mb: 1.5,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: '0.7rem',
          color: 'text.secondary',
        }}
      >
        Booking activity
      </Typography>

      <Box sx={{ p: 2, bgcolor: 'action.hover', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <MousePointerClick size={16} style={{ opacity: 0.7 }} />
          <Typography variant="body2">
            <strong>{data.total}</strong> booking click{data.total === 1 ? '' : 's'} from this trip
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {verticalEntries.map(([v, count]) => {
            const Icon = VERTICAL_ICON[v];
            return (
              <Box
                key={v}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  py: 0.5,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Icon size={12} />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {VERTICAL_LABEL[v]}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {count}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {data.recent.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
            Recent clicks
          </Typography>
          {data.recent.map((r) => {
            const Icon = VERTICAL_ICON[r.vertical];
            let host = r.destination_url;
            try {
              host = new URL(r.destination_url).host;
            } catch {
              // leave as-is
            }
            return (
              <Box
                key={r.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                <Typography variant="caption" sx={{ fontWeight: 600, flexShrink: 0 }}>
                  {r.provider}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {host}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {formatDistanceToNow(new Date(r.clicked_at), { addSuffix: true })}
                </Typography>
                <Box
                  component="a"
                  href={r.destination_url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}
                  aria-label="Open link"
                >
                  <ExternalLink size={12} />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
