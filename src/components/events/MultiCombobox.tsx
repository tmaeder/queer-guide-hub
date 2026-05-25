import { useState, useMemo } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface MultiComboboxOption {
  value: string;
  label: string;
}

interface MultiComboboxProps {
  options: MultiComboboxOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  maxBadges?: number;
  className?: string;
  ariaLabel?: string;
}

export function MultiCombobox({
  options,
  selected,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches.',
  maxBadges = 3,
  className,
  ariaLabel,
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedOptions = useMemo(
    () => selected.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v }),
    [selected, options],
  );

  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const clearOne = (value: string) => {
    onChange(selected.filter((v) => v !== value));
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length <= maxBadges
        ? null
        : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            'w-full justify-between min-h-[2.25rem] h-auto py-1 px-2 font-normal',
            className,
          )}
        >
          <div className="flex flex-wrap gap-1 items-center min-w-0 flex-1">
            {summary ? (
              <span className={selected.length === 0 ? 'text-muted-foreground' : ''}>
                {summary}
              </span>
            ) : (
              selectedOptions.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="secondary"
                  className="inline-flex items-center gap-1 px-1.5 py-0 text-xs2"
                >
                  {opt.label}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${opt.label}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      clearOne(opt.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        clearOne(opt.value);
                      }
                    }}
                    className="cursor-pointer hover:opacity-70"
                  >
                    <X className="size-2.5" />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[12rem]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSel = selectedSet.has(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => toggle(opt.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        isSel ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
