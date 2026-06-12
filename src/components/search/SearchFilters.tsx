import { CommandGroup, CommandItem } from '@/components/ui/command';
import { Check, Filter } from 'lucide-react';
import { usePreferenceChips } from '@/hooks/usePreferenceChips';

const quickFilters = [
  { label: 'Featured only', value: 'featured', icon: Filter },
  { label: 'Free events', value: 'free', icon: Filter },
  { label: 'Today', value: 'today', icon: Filter },
  { label: 'This week', value: 'this-week', icon: Filter },
  { label: 'Near me', value: 'nearby', icon: Filter },
  { label: 'Popular', value: 'popular', icon: Filter },
];

interface SearchFiltersProps {
  onAddFilter: (filter: string) => void;
}

export function SearchFilters({ onAddFilter }: SearchFiltersProps) {
  // Traveling preference chips — saved prefs surface as toggleable quick
  // filters in the command palette. Selecting toggles for this session.
  const { chips, toggle } = usePreferenceChips(['budget', 'accessibility', 'interest']);

  return (
    <>
      {chips.length > 0 && (
        <CommandGroup heading="Your preferences">
          {chips.map((chip) => (
            <CommandItem
              key={chip.id}
              onSelect={() => toggle(chip.id)}
              style={{ cursor: 'pointer' }}
            >
              <Check
                className="h-4 w-4 mr-4"
                style={{ opacity: chip.active ? 1 : 0 }}
                aria-hidden="true"
              />
              {chip.label}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      <CommandGroup heading="Quick filters">
        {quickFilters.map((filter) => {
          const Icon = filter.icon;
          return (
            <CommandItem
              key={filter.value}
              onSelect={() => onAddFilter(filter.value)}
              style={{ cursor: 'pointer' }}
            >
              <Icon className="h-4 w-4 mr-4 text-muted-foreground" />
              {filter.label}
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}
