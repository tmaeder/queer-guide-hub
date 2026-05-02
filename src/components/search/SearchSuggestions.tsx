import { Badge } from '@/components/ui/badge';
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { Search } from 'lucide-react';
import { SearchSuggestion } from '@/hooks/useSearchSuggestions';

interface SearchSuggestionsProps {
  suggestions: SearchSuggestion[];
  loading: boolean;
  query: string;
  onSelectSuggestion: (suggestion: SearchSuggestion) => void;
}

export function SearchSuggestions({
  suggestions,
  loading,
  query,
  onSelectSuggestion,
}: SearchSuggestionsProps) {
  if (loading && query.length >= 2) {
    return (
      <>
        <CommandSeparator />
        <CommandGroup heading="Searching...">
          <CommandItem disabled>
            <Search className="h-4 w-4 mr-2 animate-spin" />
            Finding results...
          </CommandItem>
        </CommandGroup>
      </>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Suggestions">
        {suggestions.map((suggestion) => {
          const Icon = suggestion.icon;
          const displayName = suggestion.name || suggestion.title;
          const subtitle = suggestion.subtitle;

          return (
            <CommandItem
              key={`${suggestion.type}-${suggestion.id}`}
              onSelect={() => onSelectSuggestion(suggestion)}
            >
              <Icon className="h-4 w-4 mr-3 text-muted-foreground shrink-0" />
              <div className="flex flex-col items-start flex-1 min-w-0">
                <p className="text-sm font-medium truncate w-full">{displayName}</p>
                {subtitle && (
                  <p className="text-xs text-muted-foreground truncate w-full">{subtitle}</p>
                )}
              </div>
              <Badge variant="outline">{suggestion.type}</Badge>
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}
