import { useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Check, ChevronsUpDown} from 'lucide-react';
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
import { useProfessions } from '@/hooks/useProfessions';

interface ProfessionAutocompleteProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
  disabled?: boolean;
}

export function ProfessionAutocomplete({
  value,
  onValueChange,
  placeholder = 'Select or type a profession...',
  required,
  id,
  disabled,
}: ProfessionAutocompleteProps) {
  const { professions, loading } = useProfessions();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const showCreate = search && !professions.some((p) => p.toLowerCase() === search.toLowerCase());

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
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between rounded-element bg-inverse-surface text-background placeholder:text-background/70 px-4.5 py-2 font-normal transition-all hover:opacity-95 focus:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-0',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          {loading ? (
            <TrackLoader size={16} label="Loading" className="ml-2 shrink-0 opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search profession..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No profession found.</CommandEmpty>
            <CommandGroup>
              {professions.map((profession) => (
                <CommandItem
                  key={profession}
                  value={profession}
                  onSelect={(selected) => {
                    onValueChange(selected);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === profession ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {profession}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={search}
                  onSelect={() => {
                    onValueChange(search);
                    setOpen(false);
                  }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Use "{search}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
