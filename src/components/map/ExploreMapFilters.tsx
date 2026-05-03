import React, { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ExploreMapFilters as Filters } from '@/hooks/useExploreMapData';

interface ExploreMapFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export const ExploreMapFiltersPanel: React.FC<ExploreMapFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const [open, setOpen] = useState(false);
  const hasActiveFilters = !!(filters.search || filters.category || filters.tags?.length);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAll = () => {
    onFiltersChange({});
  };

  return (
    <div className="px-3 pt-2 pb-2 bg-background/90 backdrop-blur-md">
      {/* Compact bar: search + toggle */}
      <div className="flex flex-row gap-2 items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search map…"
            aria-label="Search map locations"
            value={filters.search ?? ''}
            onChange={(e) => updateFilter('search', e.target.value || undefined)}
            className="h-9 text-sm pl-9 pr-9"
          />
          {filters.search && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Clear search"
              onClick={() => updateFilter('search', undefined)}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            >
              <X size={14} />
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          aria-label={open ? 'Hide filters' : 'Show filters'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="h-9 w-9 p-0"
        >
          <SlidersHorizontal size={16} />
        </Button>
      </div>

      {/* Expanded filters */}
      {open && (
        <div className="mt-3 flex flex-row gap-2 flex-wrap items-center">
          <div className="flex flex-col gap-1 min-w-[140px]">
            <Label htmlFor="map-category" className="text-xs">Category</Label>
            <Input
              id="map-category"
              value={filters.category ?? ''}
              onChange={(e) => updateFilter('category', e.target.value || undefined)}
              className="h-9 text-sm"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-destructive text-xs"
            >
              <X size={14} className="mr-1" />
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default ExploreMapFiltersPanel;
