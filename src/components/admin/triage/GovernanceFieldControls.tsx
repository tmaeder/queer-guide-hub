import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, MapPin, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EVENT_TYPE_OPTIONS } from '@/lib/eventTypes';
import { VENUE_CATEGORY_OPTIONS } from '@/lib/venueCategories';
import {
  listFrom,
  listFromIn,
  listFromWhere,
  searchUnifiedTagsByName,
} from '@/hooks/usePageFetchers';
import { cn } from '@/lib/utils';

const ReviewLocationMap = lazy(() => import('./ReviewLocationMap'));

interface CountryOption {
  id: string;
  name: string;
  code: string;
  flag_emoji?: string | null;
}

interface CityOption {
  id: string;
  name: string;
  country_id: string;
  latitude?: number | null;
  longitude?: number | null;
  countries?: { name?: string; code?: string } | null;
}

interface TagOption {
  id: string;
  name: string;
  slug: string;
}

export function fieldControlKind(entityType: string | undefined, key: string) {
  const normalizedEntity = entityType?.replace(/s$/, '').toLowerCase();
  if (normalizedEntity === 'venue' && key === 'category') return 'venue-category';
  if (normalizedEntity === 'event' && key === 'event_type') return 'event-type';
  if (key === 'tags') return 'tags';
  if (key === 'location') return 'location';
  return 'default';
}

function optionLabel(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function GovernanceSelectField({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const recognized = options.some((option) => option.value === value);
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-element border border-input bg-background px-4 text-13"
    >
      {!recognized && value && <option value={value}>{optionLabel(value)} (unrecognized)</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function GovernanceTagsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<TagOption[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listFromIn<TagOption>('unified_tags', 'id,name,slug', 'slug', value).then((rows) => {
      if (cancelled) return;
      setLabels(Object.fromEntries(rows.map((row) => [row.slug, row.name])));
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const query = search.trim();
    const timer = window.setTimeout(async () => {
      if (query.length < 2) {
        if (!cancelled) setResults([]);
        return;
      }
      const rows = await searchUnifiedTagsByName<TagOption>(query);
      if (!cancelled) setResults(rows.filter((row) => !value.includes(row.slug)));
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, value]);

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-element border border-input bg-background p-1.5">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 normal-case">
            {labels[tag] ?? tag}
            {!labels[tag] && <span className="text-muted-foreground">unrecognized</span>}
            <button
              type="button"
              aria-label={`Remove ${labels[tag] ?? tag}`}
              onClick={() => onChange(value.filter((entry) => entry !== tag))}
              className="rounded-element hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              role="combobox"
              aria-expanded={open}
              aria-label="Search canonical tags"
              className="h-7 min-w-28 flex-1 justify-between px-2 font-normal text-muted-foreground"
            >
              Search tags…
              <ChevronsUpDown className="size-3.5" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Type at least 2 characters…"
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>
                  <AdminEmpty
                    variant="inline"
                    noun={search.trim().length < 2 ? 'tag suggestions' : 'matching tags'}
                    filtered={search.trim().length >= 2}
                    description={
                      search.trim().length < 2
                        ? 'Type at least two characters to search.'
                        : undefined
                    }
                  />
                </CommandEmpty>
                <CommandGroup>
                  {results.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.slug}
                      onSelect={() => {
                        setLabels((current) => ({ ...current, [tag.slug]: tag.name }));
                        onChange([...value, tag.slug]);
                        setSearch('');
                        setOpen(false);
                      }}
                    >
                      <Check className="mr-2 size-4 opacity-0" aria-hidden="true" />
                      <span>{tag.name}</span>
                      <span className="ml-auto text-2xs text-muted-foreground">{tag.slug}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-2xs text-muted-foreground">
        Choose canonical tags. Imported unknown values stay visible until removed.
      </p>
    </div>
  );
}

function coordinateNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function coordinatesFromLocation(location: Record<string, unknown>) {
  const latitudeKey = 'lat' in location ? 'lat' : 'latitude' in location ? 'latitude' : 'lat';
  const longitudeKey = 'lng' in location ? 'lng' : 'longitude' in location ? 'longitude' : 'lng';
  return {
    latitudeKey,
    longitudeKey,
    latitude: coordinateNumber(location[latitudeKey]),
    longitude: coordinateNumber(location[longitudeKey]),
  };
}

export function withLocationCoordinates(
  location: Record<string, unknown>,
  latitude: number,
  longitude: number,
) {
  const keys = coordinatesFromLocation(location);
  return {
    ...location,
    [keys.latitudeKey]: Math.max(-90, Math.min(90, latitude)),
    [keys.longitudeKey]: Math.max(-180, Math.min(180, longitude)),
  };
}

function countryField(location: Record<string, unknown>) {
  if ('countryCode' in location) return 'countryCode';
  if ('country_code' in location) return 'country_code';
  return 'country';
}

function SearchableOptionField<T extends { id: string }>({
  ariaLabel,
  valueLabel,
  placeholder,
  searchPlaceholder,
  emptyText,
  options,
  optionValue,
  optionContent,
  onSearch,
  onSelect,
}: {
  ariaLabel: string;
  valueLabel: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  options: T[];
  optionValue: (option: T) => string;
  optionContent: (option: T) => ReactNode;
  onSearch?: (value: string) => void;
  onSelect: (option: T) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="h-10 w-full justify-between px-4 font-normal"
        >
          <span className={cn('truncate', !valueLabel && 'text-muted-foreground')}>
            {valueLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-60 p-0" align="start">
        <Command shouldFilter={!onSearch}>
          <CommandInput placeholder={searchPlaceholder} onValueChange={onSearch} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={optionValue(option)}
                  onSelect={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                >
                  {optionContent(option)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function GovernanceLocationField({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [cityCenter, setCityCenter] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const countryKey = countryField(value);
  const currentCountryValue = String(value[countryKey] ?? '');
  const currentCountry = useMemo(
    () =>
      countries.find(
        (country) =>
          country.code.toLowerCase() === currentCountryValue.toLowerCase() ||
          country.name.toLowerCase() === currentCountryValue.toLowerCase(),
      ) ?? null,
    [countries, currentCountryValue],
  );

  useEffect(() => {
    let cancelled = false;
    void listFrom<CountryOption>('countries', 'id,name,code,flag_emoji', {
      col: 'name',
      ascending: true,
    }).then((rows) => {
      if (!cancelled) setCountries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const query = citySearch.trim() || String(value.city ?? '').trim();
    const timer = window.setTimeout(async () => {
      if (!query) {
        if (!cancelled) setCities([]);
        return;
      }
      const filters: Array<{
        col: string;
        val: unknown;
        op?: 'eq' | 'ilike' | 'is';
      }> = [
        { col: 'duplicate_of_id', val: null, op: 'is' },
        { col: 'name', val: `%${query}%`, op: 'ilike' },
      ];
      if (currentCountry?.id) filters.push({ col: 'country_id', val: currentCountry.id });
      const rows = await listFromWhere<CityOption>(
        'cities',
        'id,name,country_id,latitude,longitude,countries(name,code)',
        filters,
        { order: { col: 'name', ascending: true }, limit: 30 },
      );
      if (cancelled) return;
      setCities(rows);
      const exact = rows.find(
        (city) => city.name.toLowerCase() === String(value.city ?? '').toLowerCase(),
      );
      if (exact?.latitude != null && exact.longitude != null) {
        setCityCenter({ latitude: exact.latitude, longitude: exact.longitude });
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [citySearch, currentCountry?.id, value.city]);

  const coordinates = coordinatesFromLocation(value);

  async function selectCountry(country: CountryOption) {
    const next = {
      ...value,
      [countryKey]:
        countryKey === 'country' && currentCountryValue.length !== 2 ? country.name : country.code,
    };
    const cityName = String(value.city ?? '').trim();
    if (cityName) {
      const matches = await listFromWhere<CityOption>(
        'cities',
        'id',
        [
          { col: 'duplicate_of_id', val: null, op: 'is' },
          { col: 'country_id', val: country.id },
          { col: 'name', val: cityName, op: 'eq' },
        ],
        { limit: 1 },
      );
      if (matches.length === 0) delete next.city;
    }
    onChange(next);
  }

  function selectCity(city: CityOption) {
    onChange({ ...value, city: city.name });
    if (city.latitude != null && city.longitude != null) {
      setCityCenter({ latitude: city.latitude, longitude: city.longitude });
    }
  }

  function updateCoordinate(key: 'latitude' | 'longitude', raw: string) {
    const number = coordinateNumber(raw);
    const next = { ...value };
    const locationKey = key === 'latitude' ? coordinates.latitudeKey : coordinates.longitudeKey;
    if (number === null) delete next[locationKey];
    else next[locationKey] = number;
    onChange(next);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,1.15fr)]">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <span className="text-2xs font-medium text-muted-foreground">Address</span>
          <Input
            aria-label="Address"
            value={String(value.address ?? '')}
            onChange={(event) => onChange({ ...value, address: event.target.value })}
            className="h-10 text-13"
          />
        </div>
        <div className="space-y-1">
          <span className="text-2xs font-medium text-muted-foreground">Country</span>
          <SearchableOptionField
            ariaLabel="Country"
            valueLabel={
              currentCountry
                ? `${currentCountry.flag_emoji ?? ''} ${currentCountry.name}`.trim()
                : currentCountryValue
            }
            placeholder="Search country…"
            searchPlaceholder="Search country…"
            emptyText="No country found."
            options={countries}
            optionValue={(country) => `${country.name} ${country.code}`}
            optionContent={(country) => (
              <>
                <Check
                  className={cn(
                    'mr-2 size-4',
                    currentCountry?.id === country.id ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
                <span>{country.flag_emoji}</span>
                <span>{country.name}</span>
                <span className="ml-auto text-2xs text-muted-foreground">{country.code}</span>
              </>
            )}
            onSelect={(country) => void selectCountry(country)}
          />
        </div>
        <div className="space-y-1">
          <span className="text-2xs font-medium text-muted-foreground">City</span>
          <SearchableOptionField
            ariaLabel="City"
            valueLabel={String(value.city ?? '')}
            placeholder="Search city…"
            searchPlaceholder="Search city…"
            emptyText="Type a city name to search."
            options={cities}
            optionValue={(city) => `${city.name} ${city.countries?.name ?? ''}`}
            optionContent={(city) => (
              <>
                <MapPin className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />
                <span>{city.name}</span>
                <span className="ml-auto text-2xs text-muted-foreground">
                  {city.countries?.code ?? city.countries?.name}
                </span>
              </>
            )}
            onSearch={setCitySearch}
            onSelect={selectCity}
          />
        </div>
        <div className="space-y-1">
          <span className="text-2xs font-medium text-muted-foreground">Postal code</span>
          <Input
            aria-label="Postal code"
            value={String(value.postal_code ?? '')}
            onChange={(event) => onChange({ ...value, postal_code: event.target.value })}
            className="h-10 text-13"
          />
        </div>
        <div className="space-y-1">
          <span className="text-2xs font-medium text-muted-foreground">Timezone</span>
          <Input
            aria-label="Timezone"
            value={String(value.timezone ?? '')}
            onChange={(event) => onChange({ ...value, timezone: event.target.value })}
            className="h-10 text-13"
          />
        </div>
        <div className="space-y-1">
          <span className="text-2xs font-medium text-muted-foreground">Latitude</span>
          <Input
            aria-label="Latitude"
            type="number"
            min={-90}
            max={90}
            step="any"
            value={coordinates.latitude ?? ''}
            onChange={(event) => updateCoordinate('latitude', event.target.value)}
            aria-invalid={
              coordinates.latitude !== null &&
              (coordinates.latitude < -90 || coordinates.latitude > 90)
            }
            className="h-10 text-13 tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <span className="text-2xs font-medium text-muted-foreground">Longitude</span>
          <Input
            aria-label="Longitude"
            type="number"
            min={-180}
            max={180}
            step="any"
            value={coordinates.longitude ?? ''}
            onChange={(event) => updateCoordinate('longitude', event.target.value)}
            aria-invalid={
              coordinates.longitude !== null &&
              (coordinates.longitude < -180 || coordinates.longitude > 180)
            }
            className="h-10 text-13 tabular-nums"
          />
        </div>
      </div>
      <Suspense
        fallback={
          <div className="h-52 animate-pulse rounded-element border border-border bg-muted/30" />
        }
      >
        <ReviewLocationMap
          latitude={coordinates.latitude}
          longitude={coordinates.longitude}
          fallbackCenter={cityCenter}
          onCoordinateChange={(latitude, longitude) =>
            onChange(withLocationCoordinates(value, latitude, longitude))
          }
        />
      </Suspense>
    </div>
  );
}

export const GOVERNANCE_SELECT_OPTIONS = {
  'venue-category': VENUE_CATEGORY_OPTIONS,
  'event-type': EVENT_TYPE_OPTIONS,
};
