import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Car style={{ height: 20, width: 20, color: 'var(--primary)', flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Rent a Car in {city}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Compare prices from top providers</Typography>
        </Box>
        <Button size="sm" onClick={() => window.open(discoverUrl, '_blank', 'noopener')}>
          <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
          Search
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Car style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Rent a Car in {city}</Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent style={{ padding: 16 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>DiscoverCars</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5 }}>
              Compare 500+ providers, free cancellation
            </Typography>
            <Button size="sm" className="w-full" onClick={() => window.open(discoverUrl, '_blank', 'noopener')}>
              <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
              Search Cars
            </Button>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent style={{ padding: 16 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>Rentalcars.com</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5 }}>
              Booking.com partner, loyalty rewards
            </Typography>
            <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(rentalcarsUrl, '_blank', 'noopener')}>
              <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
              Search Cars
            </Button>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
