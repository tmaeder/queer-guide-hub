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
import { SearchFilters } from '@/hooks/useUniversalSearch';
import { format } from 'date-fns';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';

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
    ? { from: new Date(filters.dateRange.start), to: new Date(filters.dateRange.end) }
    : undefined;

  const toggleContentType = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    
    onFiltersChange({ ...filters, types: newTypes });
  };

  const updateLocation = (location: string) => {
    onFiltersChange({ ...filters, location: location || undefined });
  };

  const updatePriceRange = (range: number[]) => {
    onFiltersChange({ 
      ...filters, 
      priceRange: { min: range[0], max: range[1] }
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
    onFiltersChange({ types: [] });
  };

  const getRelevantCategories = () => {
    if (filters.types.length === 1) {
      const type = filters.types[0] as keyof typeof popularCategories;
      return popularCategories[type] || [];
    }
    return Object.values(popularCategories).flat().slice(0, 12);
  };

  return (
    <div className="p-4 border-b space-y-4">
      {/* Content Types */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Content Types</Label>
          {filters.types.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onFiltersChange({ ...filters, types: [] })}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {contentTypes.map((type) => {
            const IconComponent = type.icon;
            return (
              <Badge
                key={type.id}
                variant={filters.types.includes(type.id) ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/80"
                onClick={() => toggleContentType(type.id)}
              >
                <IconComponent className="h-3 w-3 mr-1" />
                {type.label}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* Location Filter */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          Location
        </Label>
        <div className="relative">
          <Input
            placeholder="Enter city, state, or country..."
            value={filters.location || ''}
            onChange={(e) => updateLocation(e.target.value)}
            className="text-sm"
          />
          {filters.location && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-6 w-6 p-0"
              onClick={() => updateLocation('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Quick Categories */}
      {getRelevantCategories().length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Popular Categories</Label>
          <div className="flex flex-wrap gap-1">
            {getRelevantCategories().map((category) => (
              <Badge
                key={category}
                variant={filters.categories?.includes(category) ? "default" : "secondary"}
                className="cursor-pointer text-xs"
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
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Filter className="h-3 w-3 mr-1" />
          {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
        </Button>
        
        {(filters.location || filters.priceRange || filters.rating || (filters.categories && filters.categories.length > 0)) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive"
            onClick={clearAllFilters}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="space-y-4 pt-2 border-t">
          {/* Date Range */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              Date Range
            </Label>
            <DatePickerWithRange
              date={selectedRange}
              onSelect={(range) => {
                if (range?.from && range.to) {
                  onFiltersChange({
                    ...filters,
                    dateRange: { start: range.from, end: range.to }
                  });
                } else {
                  onFiltersChange({ ...filters, dateRange: undefined });
                }
              }}
            />
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Price Range
            </Label>
            <div className="px-2">
              <Slider
                value={[filters.priceRange?.min || 0, filters.priceRange?.max || 1000]}
                onValueChange={updatePriceRange}
                max={1000}
                step={10}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>${filters.priceRange?.min || 0}</span>
                <span>${filters.priceRange?.max || 1000}</span>
              </div>
            </div>
          </div>

          {/* Rating Filter */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              <Star className="h-3 w-3" />
              Minimum Rating
            </Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  variant={filters.rating === rating ? "default" : "outline"}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => updateRating(rating)}
                >
                  <Star className="h-3 w-3" />
                </Button>
              ))}
            </div>
          </div>

          {/* Featured/Verified Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                id="featured"
                checked={filters.featured || false}
                onCheckedChange={(checked) => 
                  onFiltersChange({ ...filters, featured: checked })
                }
              />
              <Label htmlFor="featured" className="text-sm">Featured only</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="verified"
                checked={filters.verified || false}
                onCheckedChange={(checked) => 
                  onFiltersChange({ ...filters, verified: checked })
                }
              />
              <Label htmlFor="verified" className="text-sm">Verified only</Label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};