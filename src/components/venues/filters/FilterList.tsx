import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, Loader2 } from 'lucide-react';

export function FilterList({
  items,
  selected,
  onToggle,
  searchPlaceholder,
  emptyMessage,
  loading,
  byKey,
}: {
  items: { key: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  searchPlaceholder: string;
  emptyMessage: string;
  loading?: boolean;
  /** Toggle/select by item.key (vocab slug) instead of the display label. */
  byKey?: boolean;
}) {
  const valueOf = (item: { key: string; label: string }) => (byKey ? item.key : item.label);
  return (
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
                onSelect={() => onToggle(valueOf(item))}
              >
                <Check
                  className={`mr-2 w-4 h-4 ${
                    selected.includes(valueOf(item)) ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {item.label}
              </CommandItem>
            ))
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
