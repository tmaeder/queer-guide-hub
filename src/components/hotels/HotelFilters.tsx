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
    <div className="flex flex-wrap gap-3 mb-8 p-4 rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
      <div className="relative flex-1 max-w-sm min-w-[220px]">
        <Search
          aria-hidden="true"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
        />
        <Input
          placeholder="Search hotels..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
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
