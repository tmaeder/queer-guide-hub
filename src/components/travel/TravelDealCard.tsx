import { Plane, ArrowRight, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildAviasalesUrl, getAffiliateUrl } from '@/utils/aviasalesUrl';
import { trackTravelEvent } from '@/utils/travelAnalytics';
import type { TravelDeal } from '@/hooks/useTravelDeals';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

interface TravelDealCardProps {
  deal?: TravelDeal;
  loading?: boolean;
  originCity?: string;
  destinationCity?: string;
}

function formatDate(dateStr: string | null): string {
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

/**
 * Resolves the booking URL for a deal.
 * Uses the canonical URL builder as primary source, falls back to deal.affiliate_url
 * if the builder succeeds, otherwise uses the deal URL as-is with a final fallback.
 */
function resolveBookingUrl(deal: TravelDeal): string {
  const result = buildAviasalesUrl({
    origin: deal.origin,
    destination: deal.destination,
    departDate: deal.departure_date,
    returnDate: deal.return_date,
  });

  if (result.valid && result.url) {
    return result.url;
  }

  if (deal.affiliate_url && deal.affiliate_url.startsWith('https://www.aviasales.com/')) {
    return deal.affiliate_url;
  }

  return getAffiliateUrl({
    origin: deal.origin,
    destination: deal.destination,
    departDate: deal.departure_date,
    returnDate: deal.return_date,
  });
}

export function TravelDealCard({ deal, loading = false, originCity, destinationCity }: TravelDealCardProps) {
  if (loading || !deal) {
    return (
      <Skeleton name="travel-deal-card" loading={true} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }
  const handleBookClick = () => {
    const bookingUrl = resolveBookingUrl(deal);

    trackTravelEvent('booking_click', {
      origin: deal.origin,
      destination: deal.destination,
      price: deal.price,
      currency: deal.currency,
      url_valid: bookingUrl.includes('/') && !bookingUrl.endsWith('/?marker='),
    });

    const win = window.open(bookingUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      window.location.href = bookingUrl;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent style={{ padding: 16 }}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {deal.airline ? (
              <img
                src={`https://pics.avs.io/32/32/${deal.airline}.png`}
                alt={deal.airline}
                style={{ width: 20, height: 20, flexShrink: 0, borderRadius: '50%' }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <Plane style={{ height: 16, width: 16, flexShrink: 0, color: 'var(--primary)' }} />
            )}
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              <span className="font-bold text-sm">
                {deal.origin}
              </span>
              <ArrowRight style={{ height: 14, width: 14, flexShrink: 0 }} />
              <span className="font-bold text-sm">
                {deal.destination}
              </span>
            </div>
          </div>
          <Badge className="font-bold text-sm">
            {`${deal.currency === 'eur' ? '€' : deal.currency} ${deal.price}`}
          </Badge>
        </div>

        {(originCity || destinationCity) && (
          <p className="text-xs text-muted-foreground mb-2">
            {originCity || deal.origin} to {destinationCity || deal.destination}
          </p>
        )}

        <div className="flex gap-2 flex-wrap mb-3 items-center">
          {deal.departure_date && (
            <span className="text-xs text-muted-foreground">
              {formatDate(deal.departure_date)}
              {deal.return_date && ` - ${formatDate(deal.return_date)}`}
            </span>
          )}
          {deal.airline && (
            <Badge variant="outline" style={{ fontSize: '0.7rem', height: 20 }}>{deal.airline}</Badge>
          )}
          {deal.stops === 0 ? (
            <Badge variant="outline" style={{ fontSize: '0.7rem', height: 20 }}>Direct</Badge>
          ) : (
            <Badge variant="outline" style={{ fontSize: '0.7rem', height: 20 }}>{`${deal.stops} stop${deal.stops > 1 ? 's' : ''}`}</Badge>
          )}
          {deal.duration && (
            <span className="text-xs text-muted-foreground">
              {formatDuration(deal.duration)}
            </span>
          )}
        </div>

        <Button
          size="sm"
          className="w-full"
          onClick={handleBookClick}
          aria-label={`Book flight from ${deal.origin} to ${deal.destination}`}
        >
          <ExternalLink style={{ height: 14, width: 14, marginRight: 6 }} />
          Book Flight
        </Button>
      </CardContent>
    </Card>
  );
}
