import * as React from "react";
import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

interface Country {
  name: string;
  code: string;
  flag_emoji?: string;
}

interface CountryAutocompleteProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

export function CountryAutocomplete({
  value,
  onValueChange,
  placeholder = "Select a country...",
  required,
  id,
}: CountryAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCountries = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('countries')
          .select('name, code, flag_emoji')
          .order('name');

        if (error) {
          console.error('Error fetching countries:', error);
          return;
        }

        setCountries(data || []);
      } catch (error) {
        console.error('Error fetching countries:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes((value || '').toLowerCase())
  );

  const selectedCountry = countries.find(country => country.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-muted"
        >
          <div className="flex items-center gap-2">
            {selectedCountry?.flag_emoji && (
              <span className="text-lg">{selectedCountry.flag_emoji}</span>
            )}
            <span>{value || placeholder}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 bg-background border shadow-md">
        <Command>
          <CommandInput 
            placeholder="Search countries..." 
            value={value}
            onValueChange={onValueChange}
          />
          <CommandList>
            {loading ? (
              <CommandEmpty>Loading countries...</CommandEmpty>
            ) : filteredCountries.length === 0 ? (
              <CommandEmpty>
                No country found.
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredCountries.slice(0, 10).map((country) => (
                  <CommandItem
                    key={country.code}
                    value={country.name}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue === value ? "" : currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === country.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex items-center gap-2">
                      {country.flag_emoji && (
                        <span className="text-lg">{country.flag_emoji}</span>
                      )}
                      <span>{country.name}</span>
                    </div>
                  </CommandItem>
                ))}
                {filteredCountries.length > 10 && (
                  <CommandItem disabled>
                    ... and {filteredCountries.length - 10} more
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}