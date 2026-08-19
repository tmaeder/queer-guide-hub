import { useState, useEffect } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Check, ChevronsUpDown } from 'lucide-react';
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
import { listFrom } from '@/hooks/usePageFetchers';

export interface Country {
  id: string;
  name: string;
  code: string;
  flag_emoji?: string;
}

interface CountryAutocompleteProps {
  value?: string;
  onValueChange: (value: string) => void;
  /**
   * FK fallback for the displayed selection. Used by callers whose table stores
   * only `country_id` and has no `country` text column, where `value` is always
   * empty. Resolved against the already-loaded list — no extra query.
   */
  valueId?: string | null;
  /** Called with full country object when selected (includes id for FK linking) */
  onCountrySelect?: (country: Country | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  error?: boolean;
  ariaDescribedBy?: string;
}

export function CountryAutocomplete({
  value,
  onValueChange,
  valueId,
  onCountrySelect,
  placeholder = 'Select a country...',
  required,
  disabled,
  id,
  error,
  ariaDescribedBy,
}: CountryAutocompleteProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchCountries = async () => {
      setLoading(true);
      try {
        const data = await listFrom<Country>('countries', 'id, name, code, flag_emoji', {
          col: 'name',
        });
        setCountries(data);
      } catch (err) {
        console.error('Error fetching countries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  const selectedCountry =
    countries.find((country) => country.name === value) ||
    (valueId ? countries.find((country) => country.id === valueId) : null) ||
    null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          aria-invalid={error || undefined}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          className={cn(
            // See pronoun-combobox for why the inverted plate came off: the
            // empty state put `text-muted-foreground` on an ink fill at 2.50:1.
            // `focus:outline-none` also went — `index.css` sets
            // `*:focus-visible` with `!important` as the WCAG 2.4.7 guarantee,
            // so suppressing the outline here only ever looked like it worked.
            'h-10 w-full justify-between rounded-element px-4.5 py-2 font-normal',
            !selectedCountry && 'text-muted-foreground',
            error && 'border border-destructive',
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedCountry?.flag_emoji && (
              <span className="text-xl">{selectedCountry.flag_emoji}</span>
            )}
            <span className="truncate">{selectedCountry ? selectedCountry.name : placeholder}</span>
          </span>
          {loading ? (
            <TrackLoader size={16} label="Loading" className="ml-2 shrink-0 opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((country) => (
                <CommandItem
                  key={country.id}
                  value={country.name}
                  onSelect={(selectedName) => {
                    const next = countries.find((c) => c.name === selectedName) || null;
                    onValueChange(next ? next.name : '');
                    onCountrySelect?.(next);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedCountry?.code === country.code ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {country.flag_emoji && <span className="mr-2 text-xl">{country.flag_emoji}</span>}
                  <span>{country.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
