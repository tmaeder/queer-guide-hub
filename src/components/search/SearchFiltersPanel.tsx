import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, MapPin, DollarSign, Star, Filter, X, Building2, CalendarDays, ShoppingBag, Users, Newspaper, Globe, BookOpen, Plane, Tag, Layers } from 'lucide-react';
import { SearchFilters } from '@/hooks/useSearch';
import { useTopicClusters } from '@/hooks/useTopicClusters';
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

  const toggleCluster = (clusterId: string) => {
    const current = filters.cluster_ids || [];
    const next = current.includes(clusterId)
      ? current.filter(id => id !== clusterId)
      : [...current, clusterId];
    onFiltersChange({
      ...filters,
      cluster_ids: next.length > 0 ? next : undefined,
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

  const { clusters, loading: clustersLoading } = useTopicClusters();

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Content Types */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Content Types</Label>
          {(filters.types && filters.types.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              style={{ height: 24, fontSize: '0.75rem' }}
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
                variant={(filters.types && filters.types.includes(type.id)) ? "default" : "outline"}
                style={{ cursor: 'pointer' }}
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
      <div className="flex flex-col gap-2">
        <Label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
          <MapPin style={{ height: 12, width: 12 }} />
          Location
        </Label>
        <div className="relative">
          <Input
            placeholder="Enter city, state, or country..."
            value={filters.location || ''}
            onChange={(e) => updateLocation(e.target.value)}
            style={{ fontSize: '0.875rem' }}
          />
          {filters.location && (
            <Button
              variant="ghost"
              size="sm"
              style={{ position: 'absolute', right: 4, top: 4, height: 24, width: 24, padding: 0 }}
              onClick={() => updateLocation('')}
            >
              <X style={{ height: 12, width: 12 }} />
            </Button>
          )}
        </div>
      </div>

      {/* Quick Categories */}
      {getRelevantCategories().length > 0 && (
        <div className="flex flex-col gap-2">
          <Label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Popular Categories</Label>
          <div className="flex flex-wrap gap-1">
            {getRelevantCategories().map((category) => (
              <Badge
                key={category}
                variant={filters.categories?.includes(category) ? "default" : "secondary"}
                style={{ cursor: 'pointer', fontSize: '0.75rem' }}
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

      {/* Topic Clusters */}
      {!clustersLoading && clusters.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label
              style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Layers style={{ width: 14, height: 14 }} aria-hidden="true" />
              Topics
            </Label>
            {filters.cluster_ids && filters.cluster_ids.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                style={{ height: 24, fontSize: '0.75rem' }}
                onClick={() =>
                  onFiltersChange({ ...filters, cluster_ids: undefined })
                }
              >
                Clear
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {clusters.map((cluster) => (
              <Badge
                key={cluster.id}
                variant={filters.cluster_ids?.includes(cluster.id) ? 'default' : 'secondary'}
                style={{ cursor: 'pointer', fontSize: '0.75rem' }}
                onClick={() => toggleCluster(cluster.id)}
                title={cluster.description ?? undefined}
              >
                {cluster.name}
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
          style={{ fontSize: '0.75rem' }}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Filter style={{ height: 12, width: 12, marginRight: 4 }} />
          {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
        </Button>

        {(filters.location || filters.priceRange || filters.rating || (filters.categories && filters.categories.length > 0)) && (
          <Button
            variant="ghost"
            size="sm"
            style={{ fontSize: '0.75rem', color: 'hsl(var(--destructive))' }}
            onClick={clearAllFilters}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="flex flex-col gap-4 pt-2">
          {/* Date Range */}
          <div className="flex flex-col gap-2">
            <Label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
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
          <div className="flex flex-col gap-2">
            <Label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <DollarSign style={{ height: 12, width: 12 }} />
              Price Range
            </Label>
            <div className="px-2">
              <Slider
                value={filters.priceRange || [0, 1000]}
                onValueChange={updatePriceRange}
                max={1000}
                step={10}
                style={{ width: '100%' }}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>${filters.priceRange?.[0] || 0}</span>
                <span>${filters.priceRange?.[1] || 1000}</span>
              </div>
            </div>
          </div>

          {/* Rating Filter */}
          <div className="flex flex-col gap-2">
            <Label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Star style={{ height: 12, width: 12 }} />
              Minimum Rating
            </Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  variant={filters.rating === rating ? "default" : "outline"}
                  size="sm"
                  style={{ height: 32, width: 32, padding: 0 }}
                  onClick={() => updateRating(rating)}
                >
                  <Star style={{ height: 12, width: 12 }} />
                </Button>
              ))}
            </div>
          </div>

          {/* Featured/Verified Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="featured"
                checked={filters.featured || false}
                onCheckedChange={(checked) =>
                  onFiltersChange({ ...filters, featured: checked })
                }
              />
              <Label htmlFor="featured" style={{ fontSize: '0.875rem' }}>Featured only</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="verified"
                checked={filters.verified || false}
                onCheckedChange={(checked) =>
                  onFiltersChange({ ...filters, verified: checked })
                }
              />
              <Label htmlFor="verified" style={{ fontSize: '0.875rem' }}>Verified only</Label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
