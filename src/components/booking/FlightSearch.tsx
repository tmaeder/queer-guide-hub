import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Plane, Users, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useBookings, type Flight, type FlightSearchParams } from '@/hooks/useBookings';
import { FlightResults } from './FlightResults';

export function FlightSearch() {
  const [searchParams, setSearchParams] = useState<FlightSearchParams>({
    origin: '',
    destination: '',
    departureDate: '',
    returnDate: '',
    passengers: 1,
    class: 'economy'
  });
  const [departureDate, setDepartureDate] = useState<Date>();
  const [returnDate, setReturnDate] = useState<Date>();
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Flight[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const { searchFlights } = useBookings();

  const handleSearch = async () => {
    if (!searchParams.origin || !searchParams.destination || !departureDate) {
      return;
    }

    setIsSearching(true);
    setHasSearched(false);

    try {
      const params = {
        ...searchParams,
        departureDate: format(departureDate, 'yyyy-MM-dd'),
        returnDate: returnDate ? format(returnDate, 'yyyy-MM-dd') : undefined,
      };

      const result = await searchFlights(params);
      setSearchResults(result.flights);
      setHasSearched(true);
    } catch (error) {
      console.error('Flight search error:', error);
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Search Flights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="origin">From</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="origin"
                  placeholder="Origin airport (e.g., NYC, LON)"
                  className="pl-10"
                  value={searchParams.origin}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, origin: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="destination">To</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="destination"
                  placeholder="Destination airport (e.g., PAR, TYO)"
                  className="pl-10"
                  value={searchParams.destination}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, destination: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Departure Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !departureDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {departureDate ? format(departureDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={departureDate}
                    onSelect={setDepartureDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Return Date (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !returnDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {returnDate ? format(returnDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={returnDate}
                    onSelect={setReturnDate}
                    disabled={(date) => date < new Date() || (departureDate && date < departureDate)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="passengers">Passengers</Label>
              <div className="relative">
                <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Select
                  value={searchParams.passengers.toString()}
                  onValueChange={(value) => setSearchParams(prev => ({ ...prev, passengers: parseInt(value) }))}
                >
                  <SelectTrigger className="pl-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? 'passenger' : 'passengers'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="class">Class</Label>
            <Select
              value={searchParams.class}
              onValueChange={(value) => setSearchParams(prev => ({ ...prev, class: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="economy">Economy</SelectItem>
                <SelectItem value="premium_economy">Premium Economy</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="first">First Class</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleSearch} 
            className="w-full"
            disabled={isSearching || !searchParams.origin || !searchParams.destination || !departureDate}
          >
            {isSearching ? 'Searching...' : 'Search Flights'}
          </Button>
        </CardContent>
      </Card>

      {hasSearched && (
        <FlightResults 
          flights={searchResults}
          searchParams={{
            ...searchParams,
            departureDate: departureDate ? format(departureDate, 'yyyy-MM-dd') : '',
            returnDate: returnDate ? format(returnDate, 'yyyy-MM-dd') : undefined,
          }}
        />
      )}
    </div>
  );
}