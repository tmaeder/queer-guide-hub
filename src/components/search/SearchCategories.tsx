import { Badge } from '@/components/ui/badge';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { Search, MapPin, Calendar, Store, Newspaper, Users, Tag, Briefcase } from 'lucide-react';
import Box from '@mui/material/Box';

// eslint-disable-next-line react-refresh/only-export-components
export const searchCategories = [
  { label: 'All', value: 'all', icon: Search },
  { label: 'Venues', value: 'venues', icon: MapPin },
  { label: 'Events', value: 'events', icon: Calendar },
  { label: 'Marketplace', value: 'marketplace', icon: Store },
  { label: 'News', value: 'news', icon: Newspaper },
  { label: 'Community', value: 'community', icon: Users },
  { label: 'Resources', value: 'tags', icon: Tag },
  { label: 'Professions', value: 'professions', icon: Briefcase },
];

interface SearchCategoriesProps {
  selectedCategory: string;
  query: string;
  onSelectCategory: (category: string) => void;
}

export function SearchCategories({ selectedCategory, onSelectCategory }: SearchCategoriesProps) {
  return (
    <CommandGroup heading="Search in">
      {searchCategories.map((category) => {
        const Icon = category.icon;
        return (
          <CommandItem
            key={category.value}
            onSelect={() => onSelectCategory(category.value)}
            style={{ cursor: 'pointer' }}
          >
            <Box component={Icon} sx={{ height: 16, width: 16, mr: 1 }} />
            {category.label}
            {selectedCategory === category.value && (
              <Badge variant="outline" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>
                Selected
              </Badge>
            )}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
