import { useState, useEffect, useCallback } from 'react';
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
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { toast } from 'sonner';

interface CityOption {
  id: string;
  name: string;
  country_id: string;
  country_name: string;
}

/**
 * City autocomplete field for the CMS.
 * Queries cities table filtered by current country_id (read from allValues).
 * Auto-sets city_id FK via setFields when a city is selected.
 * When a city is selected, also prefills country + country_id.
 * Allows creating new cities via the resolve-or-create-city edge function.
 */
export function CityAutocompleteField({
  field,
  value,
  onChange,
  error,
  disabled,
  setFields,
  allValues,
}: FieldProps) {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { resolveAddress } = useAddressResolver();

  const countryIdField = field.relatedFields?.country_id;
  const currentCountryId =
    countryIdField && allValues ? String(allValues[countryIdField] ?? '') : '';

  useEffect(() => {
    const fetchCities = async () => {
      setLoading(true);
      try {
        const filters: Array<{ col: string; val: unknown }> = [];
        if (currentCountryId) filters.push({ col: 'country_id', val: currentCountryId });
        const data = await listFromWhere<Record<string, unknown>>(
          'cities',
          'id, name, country_id, countries!inner(name)',
          filters,
          { order: { col: 'name', ascending: true } },
        );

        setCities(
          data.map((c) => ({
            id: c.id as string,
            name: c.name as string,
            country_id: c.country_id as string,
            country_name: (c.countries as { name: string })?.name ?? '',
          })),
        );
      } catch (err) {
        console.error('Error fetching cities:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCities();
  }, [currentCountryId]);

  const selectedCity = cities.find((c) => c.name === value) || null;
  const currentValueLabel = String(value ?? '');

  const selectExisting = useCallback(
    (city: CityOption) => {
      onChange(city.name);
      if (!setFields || !field.relatedFields) return;
      const map = field.relatedFields;
      const updates: Record<string, unknown> = {};
      if (map.city_id) updates[map.city_id] = city.id;
      if (map.country_id && city.country_id) updates[map.country_id] = city.country_id;
      if (map.country && city.country_name) updates[map.country] = city.country_name;
      setFields(updates);
    },
    [onChange, setFields, field.relatedFields],
  );

  const createNew = useCallback(
    async (cityName: string) => {
      const trimmed = cityName.trim();
      if (!trimmed) return;
      setCreating(true);
      try {
        const countryName =
          field.relatedFields?.country && allValues
            ? String(allValues[field.relatedFields.country] ?? '')
            : '';
        const result = await resolveAddress(trimmed, countryName || 'Unknown');
        if (result?.city_id) {
          onChange(result.city_name || trimmed);
          if (setFields && field.relatedFields) {
            const map = field.relatedFields;
            const updates: Record<string, unknown> = {};
            if (map.city_id) updates[map.city_id] = result.city_id;
            if (map.country_id && result.country_id) updates[map.country_id] = result.country_id;
            if (map.country && result.country_name) updates[map.country] = result.country_name;
            setFields(updates);
          }
          toast.success(`City created: ${result.city_name || trimmed}`);
        } else {
          onChange(trimmed);
          toast.error('Could not create city');
        }
      } catch (err) {
        console.error('City creation failed:', err);
        onChange(trimmed);
      } finally {
        setCreating(false);
      }
    },
    [onChange, setFields, field.relatedFields, allValues, resolveAddress],
  );

  const exactMatch = search
    ? cities.some((c) => c.name.toLowerCase() === search.toLowerCase())
    : true;
  const showCreate = search.trim() !== '' && !exactMatch;

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
            aria-describedby={
              error ? `${field.name}-error` : field.helpText ? `${field.name}-help` : undefined
            }
            disabled={disabled || creating}
            className={cn(
              'w-full justify-between font-normal',
              !currentValueLabel && 'text-muted-foreground',
              error && 'border-destructive',
            )}
          >
            <span className="truncate">
              {currentValueLabel || field.placeholder || 'Search or create a city...'}
            </span>
            {loading || creating ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" aria-label="Loading" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter>
            <CommandInput
              placeholder="Search or create a city..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No cities found.</CommandEmpty>
              <CommandGroup>
                {cities.map((city) => (
                  <CommandItem
                    key={city.id}
                    value={city.country_name ? `${city.name} ${city.country_name}` : city.name}
                    onSelect={() => {
                      selectExisting(city);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedCity?.id === city.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span>
                      {city.name}
                      {city.country_name && (
                        <span style={{ color: '#888', marginLeft: 6, fontSize: '0.85em' }}>
                          {city.country_name}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
                {showCreate && (
                  <CommandItem
                    key="__create__"
                    value={`__create__${search}`}
                    onSelect={async () => {
                      await createNew(search);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <span>
                      Create: <strong>{search}</strong>
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
