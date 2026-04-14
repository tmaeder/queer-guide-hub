import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface HotelSearchFormProps {
  initialCity?: string;
  onSearch: (params: { city: string; checkIn?: string; checkOut?: string; guests: number }) => void;
}

export function HotelSearchForm({ initialCity, onSearch }: HotelSearchFormProps) {
  const [city, setCity] = useState(initialCity || '');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim()) return;
    onSearch({
      city: city.trim(),
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
      guests,
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
      <Button type="submit" size="sm">
        <Search style={{ height: 16, width: 16, marginRight: 6 }} />
        Search Hotels
      </Button>
    </Box>
  );
}
