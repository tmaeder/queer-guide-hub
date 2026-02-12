import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Filter } from "lucide-react";
import Box from '@mui/material/Box';

const quickFilters = [
  { label: "Featured only", value: "featured", icon: Filter },
  { label: "Free events", value: "free", icon: Filter },
  { label: "Today", value: "today", icon: Filter },
  { label: "This week", value: "this-week", icon: Filter },
  { label: "Near me", value: "nearby", icon: Filter },
  { label: "Popular", value: "popular", icon: Filter },
];

interface SearchFiltersProps {
  onAddFilter: (filter: string) => void;
}

export function SearchFilters({ onAddFilter }: SearchFiltersProps) {
  return (
    <CommandGroup heading="Quick filters">
      {quickFilters.map((filter) => {
        const Icon = filter.icon;
        return (
          <CommandItem
            key={filter.value}
            onSelect={() => onAddFilter(filter.value)}
            style={{ cursor: 'pointer' }}
          >
            <Box component={Icon} sx={{ height: 16, width: 16, mr: 1.5, color: 'text.secondary' }} />
            {filter.label}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
