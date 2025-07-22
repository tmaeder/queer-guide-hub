import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Plane, Users, MapPin, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function FlightSearch() {
  const [searchParams, setSearchParams] = useState({
    origin: '',
    destination: '',
    passengers: 1,
    class: 'economy'
  });
  const [departureDate, setDepartureDate] = useState<Date>();
  const [returnDate, setReturnDate] = useState<Date>();

  const handleSearchOnAviasales = () => {
    // Build Aviasales URL with search parameters
    const baseUrl = 'https://www.aviasales.com/search';
    const params = new URLSearchParams();
    
    if (searchParams.origin) params.append('origin_iata', searchParams.origin);
    if (searchParams.destination) params.append('destination_iata', searchParams.destination);
    if (departureDate) params.append('depart_date', format(departureDate, 'yyyy-MM-dd'));
    if (returnDate) params.append('return_date', format(returnDate, 'yyyy-MM-dd'));
    params.append('adults', searchParams.passengers.toString());
    params.append('children', '0');
    params.append('infants', '0');
    params.append('trip_class', searchParams.class === 'economy' ? '0' : searchParams.class === 'business' ? '1' : '2');
    
    const aviasalesUrl = `${baseUrl}?${params.toString()}`;
    window.open(aviasalesUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Search Flights on Aviasales
          </CardTitle>
        </CardHeader>
        <div 
          dangerouslySetInnerHTML={{ 
            __html: `<script async src="https://tpscr.com/content?currency=usd&trs=241762&shmarker=452012&locale=en&powered_by=false&limit=4&primary_color=000000ff&results_background_color=FFFFFF00&form_background_color=FFFFFF&campaign_id=111&promo_id=3411" charset="utf-8"></script>` 
          }} 
        />
      </Card>
    </div>
  );
}