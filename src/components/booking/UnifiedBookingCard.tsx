import { Plane, ArrowRight, ExternalLink, Hotel, MapPin, Star, Ticket } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BookingResult } from '@/lib/booking/types';
import { formatPrice } from '@/lib/booking/price';
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
    <Card className="hover:shadow-[var(--shadow-aceternity-sm)] transition-shadow">
      {result.imageUrl && (
        <img
          src={result.imageUrl}
          alt={result.title}
          style={{ width: '100%', height: 140, objectFit: 'cover' }}
        />
      )}
      <CardContent style={{ padding: 16 }}>
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icon style={{ height: 16, width: 16, flexShrink: 0, color: 'var(--primary)' }} />
            {result.vertical === 'flight' ? (
              <div className="flex items-center gap-1">
                <span className="font-bold text-sm">{result.originIata}</span>
                <ArrowRight style={{ height: 14, width: 14 }} />
                <span className="font-bold text-sm">{result.destinationIata}</span>
              </div>
            ) : (
              <p className="font-bold text-sm truncate">{result.title}</p>
            )}
          </div>
          <Badge className="ml-2 font-bold text-sm">
            {formatPrice(result.price, result.currency)}
          </Badge>
        </div>

        {result.vertical === 'flight' && originCity && (
          <p className="text-xs text-muted-foreground mb-2">
            {originCity} to {result.destinationIata}
          </p>
        )}

        {result.vertical === 'hotel' && (
          <div className="flex items-center gap-1 mb-2">
            {result.starRating && result.starRating > 0 && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: result.starRating }).map((_, i) => (
                  <Star key={i} style={{ height: 12, width: 12, fill: 'currentColor', color: 'var(--primary)' }} />
                ))}
              </div>
            )}
            {result.rating && (
              <Badge variant="outline" style={{ fontSize: '0.7rem', height: 20 }}>
                {result.rating.toFixed(1)}
              </Badge>
            )}
            {result.lgbtqFriendly && (
              <Badge variant="outline" style={{ fontSize: '0.7rem', height: 20 }}>
                LGBTQ+ Friendly
              </Badge>
            )}
          </div>
        )}

        {result.vertical === 'flight' && (
          <div className="flex gap-2 flex-wrap mb-3 items-center">
            {result.departureDate && (
              <span className="text-xs text-muted-foreground">
                {formatDate(result.departureDate)}
                {result.returnDate && ` - ${formatDate(result.returnDate)}`}
              </span>
            )}
            {result.airline && (
              <Badge variant="outline" style={{ fontSize: '0.7rem', height: 20 }}>{result.airline}</Badge>
            )}
            {result.stops === 0 ? (
              <Badge variant="outline" style={{ fontSize: '0.7rem', height: 20 }}>Direct</Badge>
            ) : result.stops !== undefined ? (
              <Badge variant="outline" style={{ fontSize: '0.7rem', height: 20 }}>
                {result.stops} stop{result.stops > 1 ? 's' : ''}
              </Badge>
            ) : null}
            {result.duration && (
              <span className="text-xs text-muted-foreground">{formatDuration(result.duration)}</span>
            )}
          </div>
        )}

        {result.vertical === 'activity' && result.durationText && (
          <p className="text-xs text-muted-foreground mb-2">{result.durationText}</p>
        )}

        {result.originalPrice && result.originalPrice > result.price && (
          <p className="text-xs text-muted-foreground line-through mb-1">
            {formatPrice(result.originalPrice, result.currency)}
          </p>
        )}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleBook}>
            <ExternalLink style={{ height: 14, width: 14, marginRight: 6 }} />
            {result.supportsInApp ? 'Book Now' : `Book ${result.vertical === 'flight' ? 'Flight' : result.vertical === 'hotel' ? 'Hotel' : 'Activity'}`}
          </Button>
          {onAddToTrip && (
            <Button size="sm" variant="outline" onClick={() => onAddToTrip(result)}>
              <MapPin style={{ height: 14, width: 14 }} />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
