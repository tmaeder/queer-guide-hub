import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Button } from '@/components/ui/button';
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
}

interface HotelSearchFormProps {
  initialCity?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  initialHotelType?: HotelTypeOption;
  initialPriceMin?: number;
  initialPriceMax?: number;
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
    });
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: 'flex',
        gap: 1.5,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}
    >
      <TextField
        label="City"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        size="small"
        required
        sx={{ flex: '1 1 200px' }}
        placeholder="Barcelona, Berlin, Bangkok..."
      />
      <TextField
        label="Check-in"
        type="date"
        value={checkIn}
        onChange={(e) => setCheckIn(e.target.value)}
        size="small"
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ flex: '0 0 150px' }}
      />
      <TextField
        label="Check-out"
        type="date"
        value={checkOut}
        onChange={(e) => setCheckOut(e.target.value)}
        size="small"
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ flex: '0 0 150px' }}
      />
      <TextField
        label="Guests"
        type="number"
        value={guests}
        onChange={(e) => setGuests(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
        size="small"
        slotProps={{ htmlInput: { min: 1, max: 9 } }}
        sx={{ flex: '0 0 80px' }}
      />
      <TextField
        select
        label="Type"
        value={hotelType}
        onChange={(e) => setHotelType(e.target.value as HotelTypeOption)}
        size="small"
        sx={{ flex: '0 0 170px' }}
      >
        {HOTEL_TYPE_OPTIONS.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {TYPE_LABELS[opt]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Min €"
        type="number"
        value={priceMin}
        onChange={(e) => setPriceMin(e.target.value)}
        size="small"
        slotProps={{ htmlInput: { min: 0, 'aria-label': 'Minimum price' } }}
        sx={{ flex: '0 0 90px' }}
      />
      <TextField
        label="Max €"
        type="number"
        value={priceMax}
        onChange={(e) => setPriceMax(e.target.value)}
        size="small"
        slotProps={{ htmlInput: { min: 0, 'aria-label': 'Maximum price' } }}
        sx={{ flex: '0 0 90px' }}
      />
      <Button type="submit" size="sm">
        <Search style={{ height: 16, width: 16, marginRight: 6 }} />
        Search Hotels
      </Button>
    </Box>
  );
}
