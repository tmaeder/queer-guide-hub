import { useState, useEffect, useRef } from 'react';
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plane style={{ height: 20, width: 20, color: 'var(--primary)' }} />
            Search Flights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
              <div>
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- shadcn Input forwards id; htmlFor pattern not yet wired */}
                <label className="text-sm font-medium mb-1 block">Departure</label>
                <Input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- shadcn Input forwards id; htmlFor pattern not yet wired */}
                <label className="text-sm font-medium mb-1 block">Return (optional)</label>
                <Input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  min={departureDate || new Date().toISOString().split('T')[0]}
                />
              </div>
              <Button onClick={handleSearch} disabled={!origin} style={{ alignSelf: 'end' }}>
                <Search style={{ height: 16, width: 16, marginRight: 6 }} />
                Search
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {searchTriggered && (
        <div>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Searching for deals...</p>
            </div>
          ) : deals && deals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deals.map((deal, i) => (
                <TravelDealCard
                  key={`${deal.origin}-${deal.destination}-${deal.departure_date}-${i}`}
                  deal={deal}
                  originCity={originLabel.split(' (')[0] || originCity || undefined}
                  destinationCity={destinationLabel.split(' (')[0] || undefined}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No deals found for this route. Try different dates or destinations.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
