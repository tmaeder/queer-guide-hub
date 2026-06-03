import React, { useState } from 'react';
import { Check, Navigation, Loader2 } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { hapticTrigger } from '@/hooks/useHaptics';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { MapFilterKey, MapShellFilters } from './MapShell.types';

// Venue categories that carry real data. `other` is excluded — it's the
// 83%-of-rows catch-all and filtering to it is meaningless.
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'club', label: 'Club' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'sauna', label: 'Sauna' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'community_center', label: 'Community' },
  { value: 'event-venue', label: 'Event venue' },
  { value: 'theater', label: 'Theater' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'salon', label: 'Salon' },
];

// Curated from the most-used real `venues.tags` values so every option is a
// guaranteed array-overlap match (the column stores kebab-case strings, not
// display labels). Humanised for display.
const TAGS: { value: string; label: string }[] = [
  { value: 'lgbt-friendly', label: 'LGBT-friendly' },
  { value: 'gay-bar', label: 'Gay bar' },
  { value: 'gay-friendly', label: 'Gay-friendly' },
  { value: 'lgbtq-friendly', label: 'LGBTQ-friendly' },
  { value: 'cruising', label: 'Cruising' },
  { value: 'clothing-optional', label: 'Clothing-optional' },
  { value: 'casual', label: 'Casual' },
  { value: 'trendy', label: 'Trendy' },
  { value: 'good-for-groups', label: 'Good for groups' },
  { value: 'good-for-singles', label: 'Good for singles' },
  { value: 'good-for-dates', label: 'Good for dates' },
  { value: 'great-value', label: 'Great value' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'local-tips', label: 'Local tips' },
];

interface MapFiltersPanelProps {
  availableFilters: MapFilterKey[];
  filters: MapShellFilters;
  onFiltersChange: (filters: MapShellFilters) => void;
}

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
      {children}
      {count != null && count > 0 && (
        <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-foreground text-background text-2xs font-semibold normal-case tracking-normal">
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * Real, data-backed map filters: category (single-select chips), tags
 * (searchable multi-select), and a near-me radius toggle. Designed to sit
 * inside both the desktop filter popover and the mobile bottom sheet.
 * Time/era keep their dedicated inline popovers in the command bar.
 */
export const MapFiltersPanel = ({
  availableFilters,
  filters,
  onFiltersChange,
}: MapFiltersPanelProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);

  const selectedTags = filters.tags ?? [];

  const setCategory = (value: string) => {
    hapticTrigger('nudge');
    const next = { ...filters };
    if (next.category === value) delete next.category;
    else next.category = value;
    onFiltersChange(next);
  };

  const toggleTag = (value: string) => {
    hapticTrigger('nudge');
    const has = selectedTags.includes(value);
    const tags = has ? selectedTags.filter((x) => x !== value) : [...selectedTags, value];
    const next = { ...filters };
    if (tags.length) next.tags = tags;
    else delete next.tags;
    onFiltersChange(next);
  };

  const toggleNearMe = () => {
    hapticTrigger('nudge');
    if (filters.nearMe) {
      const next = { ...filters };
      delete next.nearMe;
      onFiltersChange(next);
      return;
    }
    if (!navigator.geolocation) {
      toast({
        title: t('map.geolocate.unsupported', { defaultValue: 'Geolocation unavailable' }),
        variant: 'destructive',
      });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onFiltersChange({
          ...filters,
          nearMe: { lat: pos.coords.latitude, lng: pos.coords.longitude, radiusKm: 10 },
        });
      },
      (err) => {
        setLocating(false);
        let title: string;
        switch (err.code) {
          case 1:
            title = t('map.geolocate.denied', {
              defaultValue: 'Location access is off — "Near me" needs your location',
            });
            break;
          case 2:
            title = t('map.geolocate.unavailable', {
              defaultValue: "Couldn't get your location — try again in a moment",
            });
            break;
          case 3:
            title = t('map.geolocate.timeout', {
              defaultValue: 'Location lookup timed out — try again',
            });
            break;
          default:
            title = t('map.geolocate.denied', {
              defaultValue: 'Location access is off — "Near me" needs your location',
            });
        }
        toast({ title });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const showCategory = availableFilters.includes('category');
  const showTags = availableFilters.includes('tags');
  const showNearMe = availableFilters.includes('near-me');

  return (
    <div className="flex flex-col gap-4">
      {showCategory && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Category</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const active = filters.category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    'h-8 px-4 text-xs rounded-badge border transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                    active
                      ? 'bg-foreground text-background border-foreground font-semibold'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showNearMe && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Distance</SectionLabel>
          <button
            type="button"
            aria-pressed={!!filters.nearMe}
            onClick={toggleNearMe}
            disabled={locating}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 text-sm rounded-element border transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              filters.nearMe
                ? 'bg-foreground text-background border-foreground'
                : 'border-border hover:bg-muted',
            )}
          >
            {locating ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Navigation size={14} aria-hidden="true" />
            )}
            {filters.nearMe ? 'Within 10 km of you' : 'Near me'}
          </button>
        </div>
      )}

      {showTags && (
        <div className="flex flex-col gap-2">
          <SectionLabel count={selectedTags.length}>Tags</SectionLabel>
          <Command className="border border-border rounded-element">
            <CommandInput placeholder="Search tags…" className="h-9" />
            <CommandList className="max-h-44">
              <CommandEmpty>No tags found.</CommandEmpty>
              <CommandGroup>
                {TAGS.map((tag) => {
                  const active = selectedTags.includes(tag.value);
                  return (
                    <CommandItem
                      key={tag.value}
                      value={tag.label}
                      onSelect={() => toggleTag(tag.value)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Check size={14} className={cn('shrink-0', active ? 'opacity-100' : 'opacity-0')} />
                      <span className="text-sm">{tag.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
};

export default MapFiltersPanel;
