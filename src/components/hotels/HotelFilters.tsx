import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHotelFilterMeta } from '@/hooks/useHotelFilterMeta';
import { HOTEL_TYPE_OPTIONS, HOTEL_PRICE_OPTIONS } from './hotelFilterOptions';

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
  const { data: meta } = useHotelFilterMeta();

  const visibleTypes = meta
    ? HOTEL_TYPE_OPTIONS.filter((o) => meta.availableTypes.has(o.value))
    : HOTEL_TYPE_OPTIONS;

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <div className="relative flex-1 max-w-xs min-w-[200px]">
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
      </div>

      {visibleTypes.length > 0 && (
        <Select value={hotelType} onValueChange={onTypeChange}>
          <SelectTrigger style={{ width: 160 }}>
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {visibleTypes.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {meta?.priceAvailable && (
        <Select value={priceRange} onValueChange={onPriceChange}>
          <SelectTrigger style={{ width: 160 }}>
            <SelectValue placeholder="Any Price" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Price</SelectItem>
            {HOTEL_PRICE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
