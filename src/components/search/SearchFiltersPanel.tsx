import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, MapPin, DollarSign, Star, Filter, X, Building2, CalendarDays, ShoppingBag, Users, Newspaper, Globe, BookOpen, Plane, Tag } from 'lucide-react';
import { SearchFilters } from '@/hooks/useSearch';
import { format } from 'date-fns';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SearchFiltersPanelProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

const contentTypes = [
  { id: 'venue', label: 'Venues', icon: Building2 },
  { id: 'event', label: 'Events', icon: CalendarDays },
  { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
  { id: 'user', label: 'Users', icon: Users },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'location', label: 'Locations', icon: Globe },
  { id: 'content', label: 'Wiki', icon: BookOpen },
  { id: 'travel', label: 'Travel', icon: Plane },
  { id: 'personality', label: 'Personalities', icon: Users },
  { id: 'ressource', label: 'Resources', icon: Tag }
];

const popularCategories = {
  venue: ['Restaurant', 'Bar', 'Hotel', 'Club', 'Gallery', 'Theater'],
  event: ['Concert', 'Festival', 'Workshop', 'Conference', 'Sports', 'Art'],
  marketplace: ['Electronics', 'Fashion', 'Food', 'Services', 'Automotive', 'Health'],
  news: ['Local', 'Politics', 'Business', 'Technology', 'Sports', 'Entertainment'],
  personality: ['Artist', 'Actor', 'Musician', 'Writer', 'Activist', 'Politician'],
  ressource: ['Health', 'Education', 'Legal', 'Community', 'Support', 'Resources']
};

export const SearchFiltersPanel = ({ filters, onFiltersChange }: SearchFiltersPanelProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedRange: DateRange | undefined = filters.dateRange
    ? { from: filters.dateRange[0], to: filters.dateRange[1] }
    : undefined;

  const toggleContentType = (type: string) => {
    const currentTypes = filters.types || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    
    onFiltersChange({ ...filters, types: newTypes });
  };

  const updateLocation = (location: string) => {
    onFiltersChange({ ...filters, location: location || undefined });
  };

  const updatePriceRange = (range: number[]) => {
    onFiltersChange({ 
      ...filters, 
      priceRange: [range[0], range[1]]
    });
  };

  const updateRating = (rating: number) => {
    onFiltersChange({ ...filters, rating });
  };

  const addCategory = (category: string) => {
    const categories = filters.categories || [];
    if (!categories.includes(category)) {
      onFiltersChange({ 
        ...filters, 
        categories: [...categories, category]
      });
    }
  };

  const removeCategory = (category: string) => {
    const categories = filters.categories || [];
    onFiltersChange({ 
      ...filters, 
      categories: categories.filter(c => c !== category)
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  const getRelevantCategories = () => {
    if (filters.types && filters.types.length === 1) {
      const type = filters.types[0] as keyof typeof popularCategories;
      return popularCategories[type] || [];
    }
    return Object.values(popularCategories).flat().slice(0, 12);
  };

  return (
    <div sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Content Types */}
      <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Content Types</Label>
          {(filters.types && filters.types.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              sx={{ height: 24, fontSize: '0.75rem' }}
              onClick={() => onFiltersChange({ ...filters, types: [] })}
            >
              Clear
            </Button>
          )}
        </div>
        <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {contentTypes.map((type) => {
            const IconComponent = type.icon;
            return (
              <Badge
                key={type.id}
                variant={(filters.types && filters.types.includes(type.id)) ? "default" : "outline"}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(var(--primary-rgb), 0.8)' } }}
                onClick={() => toggleContentType(type.id)}
              >
                <IconComponent style={{ height: 12, width: 12, marginRight: 4 }} />
                {type.label}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* Location Filter */}
      <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label sx={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <MapPin style={{ height: 12, width: 12 }} />
          Location
        </Label>
        <div sx={{ position: 'relative' }}>
          <Input
            placeholder="Enter city, state, or country..."
            value={filters.location || ''}
            onChange={(e) => updateLocation(e.target.value)}
            sx={{ fontSize: '0.875rem' }}
          />
          {filters.location && (
            <Button
              variant="ghost"
              size="sm"
              sx={{ position: 'absolute', right: 4, top: 4, height: 24, width: 24, p: 0 }}
              onClick={() => updateLocation('')}
            >
              <X style={{ height: 12, width: 12 }} />
            </Button>
          )}
        </div>
      </div>

      {/* Quick Categories */}
      {getRelevantCategories().length > 0 && (
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Popular Categories</Label>
          <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {getRelevantCategories().map((category) => (
              <Badge
                key={category}
                variant={filters.categories?.includes(category) ? "default" : "secondary"}
                sx={{ cursor: 'pointer', fontSize: '0.75rem' }}
                onClick={() => 
                  filters.categories?.includes(category) 
                    ? removeCategory(category)
                    : addCategory(category)
                }
              >
                {category}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Advanced Filters Toggle */}
      <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
        <Button
          variant="ghost"
          size="sm"
          sx={{ fontSize: '0.75rem' }}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Filter style={{ height: 12, width: 12, marginRight: 4 }} />
          {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
        </Button>
        
        {(filters.location || filters.priceRange || filters.rating || (filters.categories && filters.categories.length > 0)) && (
          <Button
            variant="ghost"
            size="sm"
            sx={{ fontSize: '0.75rem', color: 'error.main' }}
            onClick={clearAllFilters}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          {/* Date Range */}
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label sx={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarIcon style={{ height: 12, width: 12 }} />
              Date Range
            </Label>
            <DatePickerWithRange
              date={selectedRange}
              onSelect={(range) => {
                if (range?.from && range.to) {
                  onFiltersChange({
                    ...filters,
                    dateRange: [range.from, range.to]
                  });
                } else {
                  onFiltersChange({ ...filters, dateRange: undefined });
                }
              }}
            />
          </div>

          {/* Price Range */}
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label sx={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DollarSign style={{ height: 12, width: 12 }} />
              Price Range
            </Label>
            <div sx={{ px: 1 }}>
              <Slider
                value={filters.priceRange || [0, 1000]}
                onValueChange={updatePriceRange}
                max={1000}
                step={10}
                sx={{ width: '100%' }}
              />
              <div sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
                <span>${filters.priceRange?.[0] || 0}</span>
                <span>${filters.priceRange?.[1] || 1000}</span>
              </div>
            </div>
          </div>

          {/* Rating Filter */}
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label sx={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Star style={{ height: 12, width: 12 }} />
              Minimum Rating
            </Label>
            <div sx={{ display: 'flex', gap: 0.5 }}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  variant={filters.rating === rating ? "default" : "outline"}
                  size="sm"
                  sx={{ height: 32, width: 32, p: 0 }}
                  onClick={() => updateRating(rating)}
                >
                  <Star style={{ height: 12, width: 12 }} />
                </Button>
              ))}
            </div>
          </div>

          {/* Featured/Verified Toggle */}
          <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                id="featured"
                checked={filters.featured || false}
                onCheckedChange={(checked) => 
                  onFiltersChange({ ...filters, featured: checked })
                }
              />
              <Label htmlFor="featured" sx={{ fontSize: '0.875rem' }}>Featured only</Label>
            </div>
            
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                id="verified"
                checked={filters.verified || false}
                onCheckedChange={(checked) => 
                  onFiltersChange({ ...filters, verified: checked })
                }
              />
              <Label htmlFor="verified" sx={{ fontSize: '0.875rem' }}>Verified only</Label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};