import * as React from 'react';
import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
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
        const data = await listFrom<Country>(
          'countries',
          'id, name, code, flag_emoji',
          { col: 'name' },
        );
        setCountries(data);
      } catch (err) {
        console.error('Error fetching countries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  const selectedCountry = countries.find((country) => country.name === value) || null;

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
            'w-full justify-between font-normal',
            !selectedCountry && 'text-muted-foreground',
            error && 'border-destructive',
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedCountry?.flag_emoji && (
              <span style={{ fontSize: '1.25rem' }}>{selectedCountry.flag_emoji}</span>
            )}
            <span className="truncate">{selectedCountry ? selectedCountry.name : placeholder}</span>
          </span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" aria-label="Loading" />
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
                  {country.flag_emoji && (
                    <span className="mr-2" style={{ fontSize: '1.25rem' }}>
                      {country.flag_emoji}
                    </span>
                  )}
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
