import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';

// eslint-disable-next-line react-refresh/only-export-components
export const HOTEL_TYPE_OPTIONS = [
  'all',
  'hotel',
  'boutique',
  'bnb',
  'hostel',
  'guesthouse',
  'apartment',
  'resort',
] as const;

export type HotelTypeOption = (typeof HOTEL_TYPE_OPTIONS)[number];

const TYPE_LABELS: Record<HotelTypeOption, string> = {
  all: 'Any type',
  hotel: 'Hotel',
  boutique: 'Boutique Hotel',
  bnb: 'B&B',
  hostel: 'Hostel',
  guesthouse: 'Guesthouse',
  apartment: 'Apartment',
  resort: 'Resort',
};

export interface HotelSearchParams {
  city: string;
  checkIn?: string;
  checkOut?: string;
  guests: number;
  hotelType?: HotelTypeOption;
  priceMin?: number;
  priceMax?: number;
  lgbtqFriendlyOnly?: boolean;
}

interface HotelSearchFormProps {
  initialCity?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  initialHotelType?: HotelTypeOption;
  initialPriceMin?: number;
  initialPriceMax?: number;
  initialLgbtqFriendlyOnly?: boolean;
  onSearch: (params: HotelSearchParams) => void;
}

function parseBound(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function HotelSearchForm({
  initialCity,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  initialHotelType,
  initialPriceMin,
  initialPriceMax,
  initialLgbtqFriendlyOnly,
  onSearch,
}: HotelSearchFormProps) {
  const [city, setCity] = useState(initialCity || '');
  const [checkIn, setCheckIn] = useState(initialCheckIn || '');
  const [checkOut, setCheckOut] = useState(initialCheckOut || '');
  const [guests, setGuests] = useState(initialGuests ?? 2);
  const [hotelType, setHotelType] = useState<HotelTypeOption>(initialHotelType || 'all');
  const [priceMin, setPriceMin] = useState<string>(
    initialPriceMin !== undefined ? String(initialPriceMin) : '',
  );
  const [priceMax, setPriceMax] = useState<string>(
    initialPriceMax !== undefined ? String(initialPriceMax) : '',
  );
  const [lgbtqFriendlyOnly, setLgbtqFriendlyOnly] = useState<boolean>(
    initialLgbtqFriendlyOnly ?? false,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim()) return;
    onSearch({
      city: city.trim(),
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
      guests,
      hotelType: hotelType === 'all' ? undefined : hotelType,
      priceMin: parseBound(priceMin),
      priceMax: parseBound(priceMax),
      lgbtqFriendlyOnly: lgbtqFriendlyOnly || undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-3 flex-wrap items-end"
    >
      <div className="flex flex-col gap-1" style={{ flex: '1 1 200px' }}>
        <Label className="text-xs">City</Label>
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
          placeholder="Barcelona, Berlin, Bangkok..."
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1" style={{ flex: '0 0 150px' }}>
        <Label className="text-xs">Check-in</Label>
        <Input
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1" style={{ flex: '0 0 150px' }}>
        <Label className="text-xs">Check-out</Label>
        <Input
          type="date"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1" style={{ flex: '0 0 80px' }}>
        <Label className="text-xs">Guests</Label>
        <Input
          type="number"
          value={guests}
          onChange={(e) => setGuests(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
          min={1}
          max={9}
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1" style={{ flex: '0 0 170px' }}>
        <Label className="text-xs">Type</Label>
        <Select value={hotelType} onValueChange={(v) => setHotelType(v as HotelTypeOption)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOTEL_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {TYPE_LABELS[opt]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1" style={{ flex: '0 0 90px' }}>
        <Label className="text-xs">Min €</Label>
        <Input
          type="number"
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value)}
          min={0}
          aria-label="Minimum price"
          className="h-9"
        />
      </div>
      <div className="flex flex-col gap-1" style={{ flex: '0 0 90px' }}>
        <Label className="text-xs">Max €</Label>
        <Input
          type="number"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
          min={0}
          aria-label="Maximum price"
          className="h-9"
        />
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ flex: '0 0 auto' }}>
        <input
          type="checkbox"
          checked={lgbtqFriendlyOnly}
          onChange={(e) => setLgbtqFriendlyOnly(e.target.checked)}
          aria-label="LGBTQ+ friendly only"
          className="h-4 w-4"
        />
        LGBTQ+ friendly only
      </label>
      <Button type="submit" size="sm">
        <Search style={{ height: 16, width: 16, marginRight: 6 }} />
        Search Hotels
      </Button>
    </form>
  );
}
