import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useSearchSuggestions, type SearchSuggestion } from '@/hooks/useSearchSuggestions';
import { cn } from '@/lib/utils';
import type { MapShellFilters } from '../MapShell.types';
import { TransitIcon } from '@/components/transit/TransitIcon';

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

export interface MapSearchFieldProps {
  query: string;
  onQueryChange: (q: string) => void;
  filters: MapShellFilters;
  onFiltersChange: (filters: MapShellFilters) => void;
  /** Fired when the field empties + closes (clear button). */
  onCollapse?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}

/**
 * Expanded map search combobox, mounted by `MapBar` at every width. Primary action narrows the map to the typed term; picking
 * a suggestion jumps to that entity's detail page.
 */
export const MapSearchField = ({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  onCollapse,
  inputRef: inputRefProp,
  className,
}: MapSearchFieldProps) => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const localRef = useRef<HTMLInputElement | null>(null);
  const inputRef = inputRefProp ?? localRef;

  const { suggestions, loading } = useSearchSuggestions(query);

  const applySearchFilter = (q: string) => {
    const term = q.trim();
    onFiltersChange({ ...filters, search: term || undefined });
    setPopoverOpen(false);
    inputRef.current?.blur();
  };

  const handleSelect = (item: SearchSuggestion) => {
    const builder = TYPE_PATH[item.type];
    const slug = (item as unknown as { slug?: string }).slug ?? item.id;
    if (builder && slug) {
      setPopoverOpen(false);
      navigate(builder(slug));
    }
  };

  // Enter filters the map (the expected behaviour), rather than teleporting
  // to the first suggestion.
  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim().length >= 2) {
      e.preventDefault();
      applySearchFilter(query);
    }
  };

  const searchLabel = t('map.commandBar.searchThisMap', { defaultValue: 'Search this map' });

  return (
    <Popover
      open={popoverOpen && (loading || suggestions.length > 0 || query.length >= 2)}
      onOpenChange={setPopoverOpen}
    >
      <PopoverTrigger asChild>
        <div
          className={cn(
            // The field owns its own box. It used to be a frameless input
            // relying on CommandBar's pill for a border; MapBar has no pill,
            // and a search field that only looks like one inside a particular
            // parent is a field that will lose its edges the next time it
            // moves.
            'relative flex h-10 w-56 shrink-0 items-center border-2 border-foreground bg-background',
            'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
            className,
          )}
          role="combobox"
          aria-expanded={popoverOpen}
          aria-controls="map-shell-listbox"
        >
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            <TransitIcon name="search" size={14} />
          </span>
          <Input
            ref={inputRef}
            placeholder={searchLabel}
            aria-label={searchLabel}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setPopoverOpen(true);
            }}
            onFocus={() => setPopoverOpen(true)}
            onKeyDown={handleEnter}
            // The wrapper draws the border and the fill; the input is just the
            // text. Dropping `Input`'s plate background means dropping its
            // `text-background` foreground too, or the text inverts.
            className="h-full border-0 bg-transparent pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {loading && (
            <TrackLoader size={12} className="absolute right-7 top-1/2 -translate-y-1/2" />
          )}
          {query && (
            <button
              type="button"
              aria-label={t('map.commandBar.clearSearch', { defaultValue: 'Clear search' })}
              onClick={() => {
                onQueryChange('');
                if (filters.search) onFiltersChange({ ...filters, search: undefined });
                setPopoverOpen(false);
                onCollapse?.();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        id="map-shell-listbox"
        align="start"
        className="p-0 w-[--radix-popover-trigger-width] border-border"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {!loading && query.length < 2 && (
              <CommandEmpty>
                {t('map.commandBar.typeMore', { defaultValue: 'Type at least 2 characters' })}
              </CommandEmpty>
            )}
            {query.trim().length >= 2 && (
              <CommandGroup>
                <CommandItem
                  value="__filter-map__"
                  onSelect={() => applySearchFilter(query)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <TransitIcon name="search" size={14} />
                  <span className="flex-1 truncate text-sm">
                    {t('map.commandBar.filterMapFor', {
                      defaultValue: 'Filter map for "{{query}}"',
                      query: query.trim(),
                    })}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {suggestions.length > 0 && (
              <CommandGroup
                heading={t('map.commandBar.jumpToPlace', { defaultValue: 'Jump to a place' })}
              >
                {suggestions.map((s) => (
                  <CommandItem
                    key={`${s.type}-${s.id}`}
                    value={`${s.type}-${s.id}`}
                    onSelect={() => handleSelect(s)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <span className="flex-1 truncate text-sm">{s.name}</span>
                    <Badge variant="outline" className="text-xs h-5 px-2">
                      {t(`map.entityType.${s.type}`, {
                        defaultValue: TYPE_LABEL[s.type] ?? s.type,
                      })}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!loading && suggestions.length === 0 && query.trim().length >= 2 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {t('map.commandBar.noMatches', {
                  defaultValue: 'No places match — Enter still filters the map.',
                })}
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MapSearchField;
