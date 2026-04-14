import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { Plane, ArrowRight, ExternalLink, Hotel, MapPin, Star, Ticket } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { BookingResult } from '@/lib/booking/types';
import { trackTravelEvent } from '@/utils/travelAnalytics';

interface UnifiedBookingCardProps {
  result: BookingResult;
  originCity?: string;
  onAddToTrip?: (result: BookingResult) => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(minutes: number | undefined): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat(navigator?.language || 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

const verticalIcons = {
  flight: Plane,
  hotel: Hotel,
  activity: Ticket,
};

export function UnifiedBookingCard({ result, originCity, onAddToTrip }: UnifiedBookingCardProps) {
  const Icon = verticalIcons[result.vertical];

  const handleBook = () => {
    trackTravelEvent('booking_click', {
      provider: result.provider,
      vertical: result.vertical,
      title: result.title,
      price: result.price,
      currency: result.currency,
    });

    if (result.bookingUrl) {
      const win = window.open(result.bookingUrl, '_blank', 'noopener,noreferrer');
      if (!win) window.location.href = result.bookingUrl;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      {result.imageUrl && (
        <Box
          component="img"
          src={result.imageUrl}
          alt={result.title}
          sx={{ width: '100%', height: 140, objectFit: 'cover' }}
        />
      )}
      <CardContent style={{ padding: 16 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            <Icon style={{ height: 16, width: 16, flexShrink: 0, color: 'var(--primary)' }} />
            {result.vertical === 'flight' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                  {result.originIata}
                </Typography>
                <ArrowRight style={{ height: 14, width: 14 }} />
                <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                  {result.destinationIata}
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.title}
              </Typography>
            )}
          </Box>
          <Chip
            label={formatPrice(result.price, result.currency)}
            color="primary"
            size="small"
            sx={{ fontWeight: 700, fontSize: '0.875rem', ml: 1 }}
          />
        </Box>

        {/* Subtitle / meta */}
        {result.vertical === 'flight' && originCity && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
            {originCity} to {result.destinationIata}
          </Typography>
        )}

        {result.vertical === 'hotel' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            {result.starRating && result.starRating > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                {Array.from({ length: result.starRating }).map((_, i) => (
                  <Star key={i} style={{ height: 12, width: 12, fill: 'currentColor', color: 'var(--primary)' }} />
                ))}
              </Box>
            )}
            {result.rating && (
              <Chip label={result.rating.toFixed(1)} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
            )}
            {result.lgbtqFriendly && (
              <Chip label="LGBTQ+ Friendly" size="small" color="success" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
            )}
          </Box>
        )}

        {/* Flight meta chips */}
        {result.vertical === 'flight' && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, alignItems: 'center' }}>
            {result.departureDate && (
              <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {formatDate(result.departureDate)}
                {result.returnDate && ` - ${formatDate(result.returnDate)}`}
              </Typography>
            )}
            {result.airline && (
              <Chip label={result.airline} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
            )}
            {result.stops === 0 ? (
              <Chip label="Direct" size="small" color="success" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
            ) : result.stops !== undefined ? (
              <Chip label={`${result.stops} stop${result.stops > 1 ? 's' : ''}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
            ) : null}
            {result.duration && (
              <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {formatDuration(result.duration)}
              </Typography>
            )}
          </Box>
        )}

        {/* Activity meta */}
        {result.vertical === 'activity' && result.durationText && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
            {result.durationText}
          </Typography>
        )}

        {/* Original price */}
        {result.originalPrice && result.originalPrice > result.price && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', textDecoration: 'line-through', mb: 0.5 }}>
            {formatPrice(result.originalPrice, result.currency)}
          </Typography>
        )}

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="sm" className="flex-1" onClick={handleBook}>
            <ExternalLink style={{ height: 14, width: 14, marginRight: 6 }} />
            {result.supportsInApp ? 'Book Now' : `Book ${result.vertical === 'flight' ? 'Flight' : result.vertical === 'hotel' ? 'Hotel' : 'Activity'}`}
          </Button>
          {onAddToTrip && (
            <Button size="sm" variant="outline" onClick={() => onAddToTrip(result)}>
              <MapPin style={{ height: 14, width: 14 }} />
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
