import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Search, SlidersHorizontal, X } from 'lucide-react';
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
    <div className="px-3 pt-2 pb-2 bg-background/90 backdrop-blur">
      {/* Compact bar: search + toggle */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search map…"
            aria-label="Search map locations"
            value={filters.search ?? ''}
            onChange={(e) => updateFilter('search', e.target.value || undefined)}
            className="pl-8 pr-8 h-9 text-sm"
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

        <Collapsible open={open} onOpenChange={setOpen}>
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

          {/* Expanded filters */}
          <CollapsibleContent>
            <div className="mt-3 flex gap-2 flex-wrap items-end">
              <div className="flex flex-col gap-1 min-w-[140px]">
                <Label htmlFor="category-filter" className="text-xs">Category</Label>
                <Input
                  id="category-filter"
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
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};

export default ExploreMapFiltersPanel;
