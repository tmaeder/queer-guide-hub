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
import { Heart, Search } from '@/components/icons';
import { FilterChip } from '@/components/transit/FilterChip';

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
      className="flex flex-col gap-4 rounded-container bg-card p-4 shadow-soft md:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_96px]">
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="hotel-city">Where</Label>
          <Input
            id="hotel-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            placeholder="Barcelona, Berlin, Bangkok…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hotel-checkin">Check-in</Label>
          <Input
            id="hotel-checkin"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hotel-checkout">Check-out</Label>
          <Input
            id="hotel-checkout"
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hotel-guests">Guests</Label>
          <Input
            id="hotel-guests"
            type="number"
            value={guests}
            onChange={(e) => setGuests(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
            min={1}
            max={9}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex w-44 flex-col gap-1.5">
          <Label>Type</Label>
          <Select value={hotelType} onValueChange={(v) => setHotelType(v as HotelTypeOption)}>
            <SelectTrigger aria-label="Accommodation type">
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
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Price per night (€)</legend>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              min={0}
              placeholder="Min"
              aria-label="Minimum price"
              className="w-24"
            />
            <span aria-hidden className="text-muted-foreground">
              –
            </span>
            <Input
              type="number"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              min={0}
              placeholder="Max"
              aria-label="Maximum price"
              className="w-24"
            />
          </div>
        </fieldset>
        <FilterChip
          active={lgbtqFriendlyOnly}
          onClick={() => setLgbtqFriendlyOnly(!lgbtqFriendlyOnly)}
          label={
            <>
              <Heart size={14} aria-hidden />
              LGBTQ+ friendly only
            </>
          }
        />
        <Button type="submit" className="ms-auto">
          <Search size={16} />
          Search stays
        </Button>
      </div>
    </form>
  );
}
