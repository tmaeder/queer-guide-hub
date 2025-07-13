import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Hotel as HotelIcon, Users, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useBookings, type Hotel, type HotelSearchParams } from '@/hooks/useBookings';
import { HotelResults } from './HotelResults';

export function HotelSearch() {
  const [searchParams, setSearchParams] = useState<HotelSearchParams>({
    location: '',
    checkInDate: '',
    checkOutDate: '',
    rooms: 1,
    guests: 2
  });
  const [checkInDate, setCheckInDate] = useState<Date>();
  const [checkOutDate, setCheckOutDate] = useState<Date>();
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Hotel[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const { searchHotels } = useBookings();

  const handleSearch = async () => {
    if (!searchParams.location || !checkInDate || !checkOutDate) {
      return;
    }

    setIsSearching(true);
    setHasSearched(false);

    try {
      const params = {
        ...searchParams,
        checkInDate: format(checkInDate, 'yyyy-MM-dd'),
        checkOutDate: format(checkOutDate, 'yyyy-MM-dd'),
      };

      const result = await searchHotels(params);
      setSearchResults(result.hotels);
      setHasSearched(true);
    } catch (error) {
      console.error('Hotel search error:', error);
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
            <HotelIcon className="h-5 w-5" />
            Search Hotels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="location"
                placeholder="City, hotel name, or landmark"
                className="pl-10"
                value={searchParams.location}
                onChange={(e) => setSearchParams(prev => ({ ...prev, location: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-in Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !checkInDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {checkInDate ? format(checkInDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={checkInDate}
                    onSelect={setCheckInDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Check-out Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !checkOutDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {checkOutDate ? format(checkOutDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={checkOutDate}
                    onSelect={setCheckOutDate}
                    disabled={(date) => date < new Date() || (checkInDate && date <= checkInDate)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rooms">Rooms</Label>
              <Select
                value={searchParams.rooms.toString()}
                onValueChange={(value) => setSearchParams(prev => ({ ...prev, rooms: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num} {num === 1 ? 'room' : 'rooms'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="guests">Guests</Label>
              <div className="relative">
                <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Select
                  value={searchParams.guests.toString()}
                  onValueChange={(value) => setSearchParams(prev => ({ ...prev, guests: parseInt(value) }))}
                >
                  <SelectTrigger className="pl-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? 'guest' : 'guests'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button 
            onClick={handleSearch} 
            className="w-full"
            disabled={isSearching || !searchParams.location || !checkInDate || !checkOutDate}
          >
            {isSearching ? 'Searching...' : 'Search Hotels'}
          </Button>
        </CardContent>
      </Card>

      {hasSearched && (
        <HotelResults 
          hotels={searchResults}
          searchParams={{
            ...searchParams,
            checkInDate: checkInDate ? format(checkInDate, 'yyyy-MM-dd') : '',
            checkOutDate: checkOutDate ? format(checkOutDate, 'yyyy-MM-dd') : '',
          }}
        />
      )}
    </div>
  );
}