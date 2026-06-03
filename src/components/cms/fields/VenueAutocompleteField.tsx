import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { listFromWhere } from '@/hooks/usePageFetchers';

interface VenueOption {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  city_id: string | null;
  country_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Venue autocomplete for events. Searches the `venues` table (scoped to the form's
 * city when known) and, on selection, links the existing venue via relatedFields
 * (venue_id + address/city/country/coords) instead of leaving an orphan free-text
 * venue name. Free text is still allowed for venues not yet in the directory.
 */
export function VenueAutocompleteField({
  field,
  value,
  onChange,
  error,
  disabled,
  setFields,
  allValues,
}: FieldProps) {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const cityIdField = field.relatedFields?.city_id;
  const currentCityId = cityIdField && allValues ? String(allValues[cityIdField] ?? '') : '';
  const currentLabel = String(value ?? '');

  useEffect(() => {
    const q = search.trim();
    const valid = !disabled && (q.length >= 2 || !!currentCityId);
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!valid) {
        if (!cancelled) setVenues([]);
        return;
      }
      setLoading(true);
      try {
        const filters: Array<{ col: string; val: unknown; op?: 'eq' | 'ilike' }> = [];
        if (currentCityId) filters.push({ col: 'city_id', val: currentCityId });
        if (q) filters.push({ col: 'name', val: `%${q}%`, op: 'ilike' });
        const rows = await listFromWhere<Record<string, unknown>>(
          'venues',
          'id, name, address, city, country, city_id, country_id, latitude, longitude',
          filters,
          { order: { col: 'name', ascending: true }, limit: 20 },
        );
        if (cancelled) return;
        setVenues(
          rows.map((v) => ({
            id: v.id as string,
            name: v.name as string,
            address: (v.address as string) ?? null,
            city: (v.city as string) ?? null,
            country: (v.country as string) ?? null,
            city_id: (v.city_id as string) ?? null,
            country_id: (v.country_id as string) ?? null,
            latitude: (v.latitude as number) ?? null,
            longitude: (v.longitude as number) ?? null,
          })),
        );
      } catch (err) {
        console.error('Error fetching venues:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, valid ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, currentCityId, disabled]);

  const selectExisting = useCallback(
    (venue: VenueOption) => {
      onChange(venue.name);
      if (!setFields || !field.relatedFields) return;
      const map = field.relatedFields;
      const updates: Record<string, unknown> = {};
      if (map.venue_id) updates[map.venue_id] = venue.id;
      if (map.venue_address && venue.address) updates[map.venue_address] = venue.address;
      if (map.city && venue.city) updates[map.city] = venue.city;
      if (map.country && venue.country) updates[map.country] = venue.country;
      if (map.city_id && venue.city_id) updates[map.city_id] = venue.city_id;
      if (map.country_id && venue.country_id) updates[map.country_id] = venue.country_id;
      if (map.latitude && venue.latitude != null) updates[map.latitude] = venue.latitude;
      if (map.longitude && venue.longitude != null) updates[map.longitude] = venue.longitude;
      setFields(updates);
    },
    [onChange, setFields, field.relatedFields],
  );

  const applyFreeText = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      onChange(trimmed);
      // Clear any stale venue_id link when the user types a custom venue.
      if (setFields && field.relatedFields?.venue_id) {
        setFields({ [field.relatedFields.venue_id]: null });
      }
    },
    [onChange, setFields, field.relatedFields],
  );

  const exactMatch = search ? venues.some((v) => v.name.toLowerCase() === search.toLowerCase()) : true;
  const showFreeText = search.trim() !== '' && !exactMatch;

  return (
    <FieldWrapper field={field} error={error}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={field.name}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-required={field.required}
            aria-invalid={!!error}
            disabled={disabled}
            className={cn(
              'w-full justify-between font-normal',
              !currentLabel && 'text-muted-foreground',
              error && 'border-destructive',
            )}
          >
            <span className="truncate">{currentLabel || field.placeholder || 'Search or enter a venue…'}</span>
            {loading ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" aria-label="Loading" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search venues…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No matching venue.</CommandEmpty>
              <CommandGroup>
                {venues.map((venue) => (
                  <CommandItem
                    key={venue.id}
                    value={venue.id}
                    onSelect={() => {
                      selectExisting(venue);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4', currentLabel === venue.name ? 'opacity-100' : 'opacity-0')}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{venue.name}</span>
                      {(venue.city || venue.address) && (
                        <span className="text-xs text-muted-foreground">
                          {[venue.city, venue.address].filter(Boolean).join(' • ')}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
                {showFreeText && (
                  <CommandItem
                    key="__freetext__"
                    value={`__freetext__${search}`}
                    onSelect={() => {
                      applyFreeText(search);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <span>
                      Use: <strong>{search}</strong>
                    </span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldWrapper>
  );
}
