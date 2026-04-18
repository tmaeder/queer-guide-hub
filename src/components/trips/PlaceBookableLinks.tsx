import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { Hotel, Ticket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  buildPlaceBookableLinks,
  type BookableLink,
} from '@/lib/booking/placeLinks';

interface Props {
  tripId: string;
  tripPlaceId: string;
  category: 'venue' | 'event' | 'hotel' | 'custom';
  name: string;
  cityName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

const iconFor = (link: BookableLink) =>
  link.vertical === 'hotel' ? Hotel : Ticket;

/**
 * Inline affiliate booking links shown next to a trip place. Tiny icon
 * row — opens the deep search in a new tab and logs the click to
 * `trip_booking_clicks` for funnel analytics. Click logging is fire-
 * and-forget; navigation never waits on it.
 */
export function PlaceBookableLinks({
  tripId,
  tripPlaceId,
  category,
  name,
  cityName,
  startDate,
  endDate,
}: Props) {
  const { user } = useAuth();
  const links = buildPlaceBookableLinks({
    category,
    name,
    cityName,
    startDate,
    endDate,
  });

  if (links.length === 0) return null;

  const onClick = (link: BookableLink) => {
    void supabase.from('trip_booking_clicks').insert({
      trip_id: tripId,
      trip_place_id: tripPlaceId,
      user_id: user?.id ?? null,
      provider: link.provider,
      vertical: link.vertical,
      destination_url: link.url,
    });
  };

  return (
    <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center', flexShrink: 0 }}>
      {links.map((link) => {
        const Icon = iconFor(link);
        return (
          <Tooltip key={link.provider + link.vertical} title={link.label}>
            <IconButton
              size="small"
              component="a"
              href={link.url}
              target="_blank"
              rel="noopener sponsored noreferrer"
              onClick={() => onClick(link)}
              aria-label={link.label}
              sx={{
                p: 0.5,
                opacity: 0.55,
                color: 'text.secondary',
                '&:hover': { opacity: 1, color: 'brand.main' },
              }}
            >
              <Icon style={{ width: 13, height: 13 }} />
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}
