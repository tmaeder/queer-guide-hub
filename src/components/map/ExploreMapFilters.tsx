import React, { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  useSearchSuggestions,
  type SearchSuggestion,
} from '@/hooks/useSearchSuggestions';
import type { ExploreMapFilters as Filters } from '@/hooks/useExploreMapData';

interface ExploreMapFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

/** Where to navigate when the user picks a search result. Mirrors the
 *  TYPE_PATH map used by RecommendedForYou / TrendingStrip. */
const TYPE_PATH: Record<string, (slug: string) => string> = {
  venue: (slug) => `/venues/${slug}`,
  event: (slug) => `/events/${slug}`,
  city: (slug) => `/city/${slug}`,
  country: (slug) => `/country/${slug}`,
  marketplace: (slug) => `/marketplace/${slug}`,
  personality: (slug) => `/personality/${slug}`,
  queer_village: (slug) => `/villages/${slug}`,
  group: (slug) => `/groups/${slug}`,
  news: (slug) => `/news/${slug}`,
  tag: (slug) => `/tags/${slug}`,
  user: (slug) => `/profile/${slug}`,
};

const TYPE_LABEL: Record<string, string> = {
  venue: 'Venue',
  event: 'Event',
  city: 'City',
  country: 'Country',
  marketplace: 'Listing',
  personality: 'Person',
  queer_village: 'Village',
  group: 'Group',
  news: 'News',
  tag: 'Tag',
  user: 'User',
};

export const ExploreMapFiltersPanel: React.FC<ExploreMapFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const navigate = useLocalizedNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Search input is orthogonal to chip filters — it does NOT write to
  // filters.search. It only drives the autocomplete listbox; selecting a
  // result navigates to that entity's detail page.
  const { suggestions, loading } = useSearchSuggestions(query);

  const hasActiveFilters = !!(filters.category || filters.tags?.length);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAll = () => {
    onFiltersChange({});
  };

  const handleSelect = (item: SearchSuggestion) => {
    const builder = TYPE_PATH[item.type];
    const slug = (item as unknown as { slug?: string }).slug ?? item.id;
    if (builder && slug) {
      setPopoverOpen(false);
      setQuery('');
      navigate(builder(slug));
    }
  };

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      handleSelect(suggestions[0]);
    }
  };

  return (
    <div className="px-3 pt-2 pb-2 bg-background/90 backdrop-blur">
      <div className="flex gap-2 items-center">
        <Popover open={popoverOpen && (loading || suggestions.length > 0 || query.length >= 2)} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            {/* Radix forwards aria-haspopup / aria-expanded onto the asChild
                element. role="combobox" is required for those attrs to be
                valid on a non-button container (axe aria-allowed-attr). */}
            <div
              className="relative flex-1"
              role="combobox"
              aria-expanded={popoverOpen}
              aria-controls="map-search-listbox"
            >
              <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder="Search the map…"
                aria-label="Search the map"
                aria-autocomplete="list"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPopoverOpen(true);
                }}
                onFocus={() => setPopoverOpen(true)}
                onKeyDown={handleEnter}
                className="pl-8 pr-8 h-9 text-sm"
              />
              {loading && (
                <Loader2
                  size={14}
                  className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-label="Searching"
                />
              )}
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('');
                    setPopoverOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                >
                  <X size={14} />
                </Button>
              )}
            </div>
          </PopoverTrigger>

          <PopoverContent
            id="map-search-listbox"
            align="start"
            className="p-0 w-[--radix-popover-trigger-width]"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandList>
                {!loading && suggestions.length === 0 && query.length >= 2 && (
                  <CommandEmpty>No results</CommandEmpty>
                )}
                {!loading && query.length < 2 && (
                  <CommandEmpty>Type at least 2 characters…</CommandEmpty>
                )}
                {suggestions.length > 0 && (
                  <CommandGroup>
                    {suggestions.map((s) => (
                      <CommandItem
                        key={`${s.type}-${s.id}`}
                        value={`${s.type}-${s.id}`}
                        onSelect={() => handleSelect(s)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span className="flex-1 truncate text-sm">{s.name}</span>
                        <Badge variant="outline" className="text-xs h-5 px-2">
                          {TYPE_LABEL[s.type] ?? s.type}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={filtersOpen ? 'Hide filters' : 'Show filters'}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
            className="h-9 w-9 p-0"
          >
            <SlidersHorizontal size={16} />
          </Button>

          <CollapsibleContent>
            <div className="mt-3 flex gap-2 flex-wrap items-end">
              <div className="flex flex-col gap-1 min-w-[140px]">
                <Label htmlFor="category-filter" className="text-xs">
                  Category
                </Label>
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
