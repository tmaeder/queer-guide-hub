import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { X, Check, ChevronDown, Loader2 } from 'lucide-react';
import { xStyle, type FilterOption } from './constants';

// Extracted filter dropdown component to reduce repetition
export function FilterDropdown({
  label,
  open,
  onOpenChange,
  selected,
  loading,
  items,
  onToggle,
  placeholder,
  searchPlaceholder,
  emptyMessage,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  loading?: boolean;
  items: FilterOption[];
  onToggle: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs2 uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
          {label}
          {selected.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-foreground text-background text-2xs font-semibold normal-case tracking-normal">
              {selected.length}
            </span>
          )}
        </div>
      </Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-11 w-full justify-between rounded-element font-normal"
          >
            <span className="truncate text-sm">
              {selected.length > 0 ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronDown className="ml-2 shrink-0 w-3.5 h-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="border-border p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {loading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 size={16} />
                  </div>
                ) : (
                  items.map((item) => (
                    <CommandItem
                      key={item.key}
                      value={item.label}
                      onSelect={() => onToggle(item.label)}
                    >
                      <Check
                        className={`mr-2 w-4 h-4 ${
                          selected.includes(item.label) ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <div className="flex items-center gap-2">
                        {item.color && (
                          <div
                            className="rounded-full border border-border w-2.5 h-2.5"
                            // data-driven category color (allowlisted functional color)
                            style={{ backgroundColor: item.color }}
                          />
                        )}
                        {item.label}
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((val) => (
            <Badge key={val} variant="secondary">
              {val}
              <X
                style={xStyle}
                role="button"
                aria-label="Remove filter"
                onClick={() => onToggle(val)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
