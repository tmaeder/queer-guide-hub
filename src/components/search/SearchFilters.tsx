import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Filter } from "lucide-react";

const quickFilters = [
  { label: "Featured only", value: "featured" },
  { label: "Free events", value: "free" },
  { label: "Today", value: "today" },
  { label: "This week", value: "this-week" },
];

interface SearchFiltersProps {
  onAddFilter: (filter: string) => void;
}

export function SearchFilters({ onAddFilter }: SearchFiltersProps) {
  return (
    <CommandGroup heading="Filters">
      {quickFilters.map((filter) => (
        <CommandItem 
          key={filter.value}
          onSelect={() => onAddFilter(filter.value)}
          className="cursor-pointer"
        >
          <Filter className="h-4 w-4 mr-2" />
          {filter.label}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}