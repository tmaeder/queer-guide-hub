import { Car, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const MARKER = '452012';
const DISCOVERCARS_PID = MARKER; // Uses same Travelpayouts marker

interface CarRentalSectionProps {
  city: string;
  checkIn?: string;
  checkOut?: string;
  compact?: boolean;
}

function buildDiscoverCarsUrl(city: string, checkIn?: string, checkOut?: string): string {
  const params = new URLSearchParams();
  params.set('a_aid', DISCOVERCARS_PID);
  params.set('pick_up', city);
  if (checkIn) params.set('pick_up_date', checkIn);
  if (checkOut) params.set('drop_off_date', checkOut);
  return `https://www.discovercars.com/search?${params.toString()}`;
}

function buildRentalcarsUrl(city: string, checkIn?: string, _checkOut?: string): string {
  const params = new URLSearchParams();
  params.set('affiliateCode', 'travelpayouts');
  params.set('preflang', 'en');
  params.set('location', city);
  if (checkIn) params.set('puDay', checkIn.split('-')[2] || '');
  if (checkIn) params.set('puMonth', checkIn.split('-')[1] || '');
  if (checkIn) params.set('puYear', checkIn.split('-')[0] || '');
  return `https://www.rentalcars.com/search-results?${params.toString()}`;
}

export function CarRentalSection({ city, checkIn, checkOut, compact = false }: CarRentalSectionProps) {
  const discoverUrl = buildDiscoverCarsUrl(city, checkIn, checkOut);
  const rentalcarsUrl = buildRentalcarsUrl(city, checkIn, checkOut);

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-4 bg-muted">
        <Car style={{ height: 20, width: 20, color: 'var(--primary)', flexShrink: 0 }} />
        <div className="flex-1">
          <p className="font-semibold text-sm">Rent a Car in {city}</p>
          <p className="text-xs text-muted-foreground">Compare prices from top providers</p>
        </div>
        <Button size="sm" onClick={() => window.open(discoverUrl, '_blank', 'noopener')}>
          <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
          Search
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Car style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <p className="font-semibold text-base">Rent a Car in {city}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent style={{ padding: 16 }}>
            <p className="font-semibold text-sm mb-1">DiscoverCars</p>
            <p className="text-xs text-muted-foreground mb-3">
              Compare 500+ providers, free cancellation
            </p>
            <Button size="sm" className="w-full" onClick={() => window.open(discoverUrl, '_blank', 'noopener')}>
              <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
              Search Cars
            </Button>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent style={{ padding: 16 }}>
            <p className="font-semibold text-sm mb-1">Rentalcars.com</p>
            <p className="text-xs text-muted-foreground mb-3">
              Booking.com partner, loyalty rewards
            </p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(rentalcarsUrl, '_blank', 'noopener')}>
              <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
              Search Cars
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
