import { useState } from 'react';
import { format } from 'date-fns';
import { Plane, Clock, MapPin, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type Flight, type FlightSearchParams } from '@/hooks/useBookings';
import { BookingDialog } from './BookingDialog';

interface FlightResultsProps {
  flights: Flight[];
  searchParams: FlightSearchParams;
}

export function FlightResults({ flights, searchParams }: FlightResultsProps) {
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  const handleBookFlight = (flight: Flight) => {
    setSelectedFlight(flight);
    setShowBookingDialog(true);
  };

  if (flights.length === 0) {
    return (
      <Alert>
        <Plane className="h-4 w-4" />
        <AlertDescription>
          No flights found for your search criteria. Try adjusting your search parameters.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Flight Results</h3>
        <p className="text-sm text-muted-foreground">
          {flights.length} flights found
        </p>
      </div>

      <div className="space-y-4">
        {flights.map((flight) => (
          <Card key={flight.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{flight.origin}</span>
                    </div>
                    <Plane className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{flight.destination}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{format(new Date(flight.departureDate), 'MMM dd, yyyy')}</span>
                    {flight.returnDate && (
                      <>
                        <span>→</span>
                        <span>{format(new Date(flight.returnDate), 'MMM dd, yyyy')}</span>
                      </>
                    )}
                    {flight.duration && (
                      <>
                        <Clock className="h-3 w-3" />
                        <span>{Math.floor(flight.duration / 60)}h {flight.duration % 60}m</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary">{flight.airline}</Badge>
                    {flight.flightNumber && (
                      <Badge variant="outline">{flight.flightNumber}</Badge>
                    )}
                    <Badge variant={flight.stops === 0 ? "default" : "secondary"}>
                      {flight.stops === 0 ? 'Direct' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
                    </Badge>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">
                    {flight.currency} {flight.price}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    per person
                  </p>
                  <div className="flex gap-2">
                    {flight.link && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(flight.link, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleBookFlight(flight)}
                    >
                      Book Now
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedFlight && (
        <BookingDialog
          open={showBookingDialog}
          onOpenChange={setShowBookingDialog}
          bookingType="flight"
          itemData={selectedFlight}
          searchParams={searchParams}
        />
      )}
    </div>
  );
}