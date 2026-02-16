import { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Plane, Search, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AirportAutocomplete } from './AirportAutocomplete';
import { TravelDealCard } from './TravelDealCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { trackTravelEvent } from '@/utils/travelAnalytics';

interface FlightSearchFormProps {
  initialDestination?: string;
  initialDestinationLabel?: string;
}

export function FlightSearchForm({ initialDestination, initialDestinationLabel }: FlightSearchFormProps) {
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const [origin, setOrigin] = useState('');
  const [originLabel, setOriginLabel] = useState('');
  const [destination, setDestination] = useState(initialDestination || '');
  const [destinationLabel, setDestinationLabel] = useState(initialDestinationLabel || '');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);
  const originInitializedRef = useRef(false);

  // Auto-set origin when visitor origin resolves
  useEffect(() => {
    if (originIata && originCity && !originInitializedRef.current) {
      originInitializedRef.current = true;
      setOrigin(originIata);
      setOriginLabel(`${originCity} (${originIata})`);
    }
  }, [originIata, originCity]);

  const { data: deals, isLoading } = useTravelDeals({
    origin: searchTriggered ? origin : undefined,
    destination: searchTriggered ? destination : undefined,
    type: 'flights',
    limit: 10,
    enabled: searchTriggered && !!origin,
  });

  const handleSearch = () => {
    if (origin) {
      trackTravelEvent('search_submitted', {
        origin,
        destination: destination || 'any',
        has_departure: !!departureDate,
        has_return: !!returnDate,
      });
      setSearchTriggered(true);
    }
  };

  const handleSwap = () => {
    const tmpCode = origin;
    const tmpLabel = originLabel;
    setOrigin(destination);
    setOriginLabel(destinationLabel);
    setDestination(tmpCode);
    setDestinationLabel(tmpLabel);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plane style={{ height: 20, width: 20, color: 'var(--primary)' }} />
            Search Flights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto 1fr' }, gap: 2, alignItems: 'end' }}>
              <AirportAutocomplete
                value={origin}
                displayLabel={originLabel}
                onChange={(iata, label) => { setOrigin(iata); setOriginLabel(label); }}
                placeholder={originLoading ? 'Detecting location...' : 'From...'}
                label="From"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSwap}
                style={{ alignSelf: 'end', marginBottom: 2 }}
              >
                <ArrowRightLeft style={{ height: 16, width: 16 }} />
              </Button>
              <AirportAutocomplete
                value={destination}
                displayLabel={destinationLabel}
                onChange={(iata, label) => { setDestination(iata); setDestinationLabel(label); }}
                placeholder="To..."
                label="To"
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr auto' }, gap: 2, alignItems: 'end' }}>
              <Box>
                <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 0.5, display: 'block' }}>
                  Departure
                </Typography>
                <Input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </Box>
              <Box>
                <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 0.5, display: 'block' }}>
                  Return (optional)
                </Typography>
                <Input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  min={departureDate || new Date().toISOString().split('T')[0]}
                />
              </Box>
              <Button onClick={handleSearch} disabled={!origin} style={{ alignSelf: 'end' }}>
                <Search style={{ height: 16, width: 16, marginRight: 6 }} />
                Search
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {searchTriggered && (
        <Box>
          {isLoading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography sx={{ color: 'text.secondary' }}>Searching for deals...</Typography>
            </Box>
          ) : deals && deals.length > 0 ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
              {deals.map((deal, i) => (
                <TravelDealCard
                  key={`${deal.origin}-${deal.destination}-${deal.departure_date}-${i}`}
                  deal={deal}
                  originCity={originLabel.split(' (')[0] || originCity || undefined}
                  destinationCity={destinationLabel.split(' (')[0] || undefined}
                />
              ))}
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography sx={{ color: 'text.secondary' }}>
                No deals found for this route. Try different dates or destinations.
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
