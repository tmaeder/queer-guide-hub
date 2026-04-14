import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { Plane, ArrowRight, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  // Try canonical builder first (client-side validation)
  const result = buildAviasalesUrl({
    origin: deal.origin,
    destination: deal.destination,
    departDate: deal.departure_date,
    returnDate: deal.return_date,
  });

  if (result.valid && result.url) {
    return result.url;
  }

  // Fallback to server-provided URL if it looks valid
  if (deal.affiliate_url && deal.affiliate_url.startsWith('https://www.aviasales.com/')) {
    return deal.affiliate_url;
  }

  // Final fallback
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

    // Use window.open with noreferrer for security; falls back to <a> tag behavior
    const win = window.open(bookingUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Popup blocked — fallback to direct navigation
      window.location.href = bookingUrl;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent style={{ padding: 16 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            {deal.airline ? (
              <Box
                component="img"
                src={`https://pics.avs.io/32/32/${deal.airline}.png`}
                alt={deal.airline}
                sx={{ width: 20, height: 20, flexShrink: 0, borderRadius: '50%' }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <Plane style={{ height: 16, width: 16, flexShrink: 0, color: 'var(--primary)' }} />
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
              <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {deal.origin}
              </Typography>
              <ArrowRight style={{ height: 14, width: 14, flexShrink: 0 }} />
              <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {deal.destination}
              </Typography>
            </Box>
          </Box>
          <Chip
            label={`${deal.currency === 'eur' ? '\u20AC' : deal.currency} ${deal.price}`}
            color="primary"
            size="small"
            sx={{ fontWeight: 700, fontSize: '0.875rem' }}
          />
        </Box>

        {(originCity || destinationCity) && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
            {originCity || deal.origin} to {destinationCity || deal.destination}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, alignItems: 'center' }}>
          {deal.departure_date && (
            <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {formatDate(deal.departure_date)}
              {deal.return_date && ` - ${formatDate(deal.return_date)}`}
            </Typography>
          )}
          {deal.airline && (
            <Chip label={deal.airline} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
          )}
          {deal.stops === 0 ? (
            <Chip label="Direct" size="small" color="success" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
          ) : (
            <Chip label={`${deal.stops} stop${deal.stops > 1 ? 's' : ''}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
          )}
          {deal.duration && (
            <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {formatDuration(deal.duration)}
            </Typography>
          )}
        </Box>

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
