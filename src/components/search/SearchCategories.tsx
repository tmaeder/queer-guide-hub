import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Search, MapPin, Calendar, Store, Newspaper, Users, Tag, Briefcase } from "lucide-react";

export const searchCategories = [
  { label: "All", value: "all", icon: Search },
  { label: "Places", value: "venues", icon: MapPin },
  { label: "Events", value: "events", icon: Calendar },
  { label: "Market", value: "marketplace", icon: Store },
  { label: "News", value: "news", icon: Newspaper },
  { label: "Community", value: "community", icon: Users },
  { label: "Resources", value: "tags", icon: Tag },
  { label: "Professions", value: "professions", icon: Briefcase },
];

interface SearchCategoriesProps {
  selectedCategory: string;
  query: string;
  onSelectCategory: (category: string) => void;
}

export function SearchCategories({ 
  selectedCategory, 
  query, 
  onSelectCategory 
}: SearchCategoriesProps) {
  return (
    <CommandGroup heading="Search in">
      {searchCategories.map((category) => {
        const Icon = category.icon;
        return (
          <CommandItem
            key={category.value}
            onSelect={() => onSelectCategory(category.value)}
            className="cursor-pointer"
          >
            <Icon className="h-4 w-4 mr-2" />
            {category.label}
            {selectedCategory === category.value && (
              <Badge variant="outline" className="ml-auto text-xs">
                Selected
              </Badge>
            )}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}