import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Box from '@mui/material/Box';

interface HotelFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  hotelType: string;
  onTypeChange: (value: string) => void;
  priceRange: string;
  onPriceChange: (value: string) => void;
}

export function HotelFilters({
  search,
  onSearchChange,
  hotelType,
  onTypeChange,
  priceRange,
  onPriceChange,
}: HotelFiltersProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
      <Box sx={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
        <Search
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 16,
            height: 16,
            color: 'hsl(var(--muted-foreground))',
          }}
        />
        <Input
          placeholder="Search hotels..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ paddingLeft: 32 }}
        />
      </Box>

      <Select value={hotelType} onValueChange={onTypeChange}>
        <SelectTrigger style={{ width: 160 }}>
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="hotel">Hotel</SelectItem>
          <SelectItem value="bnb">B&B</SelectItem>
          <SelectItem value="hostel">Hostel</SelectItem>
          <SelectItem value="guesthouse">Guesthouse</SelectItem>
          <SelectItem value="apartment">Apartment</SelectItem>
          <SelectItem value="resort">Resort</SelectItem>
        </SelectContent>
      </Select>

      <Select value={priceRange} onValueChange={onPriceChange}>
        <SelectTrigger style={{ width: 160 }}>
          <SelectValue placeholder="Any Price" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any Price</SelectItem>
          <SelectItem value="1">$ Budget</SelectItem>
          <SelectItem value="2">$$ Mid-Range</SelectItem>
          <SelectItem value="3">$$$ Upscale</SelectItem>
          <SelectItem value="4">$$$$ Luxury</SelectItem>
        </SelectContent>
      </Select>
    </Box>
  );
}
