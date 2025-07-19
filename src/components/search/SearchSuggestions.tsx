import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Search } from "lucide-react";
import { SearchSuggestion } from "@/hooks/useSearchSuggestions";

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
  onSelectSuggestion 
}: SearchSuggestionsProps) {
  if (loading && query.length >= 2) {
    return (
      <>
        <CommandSeparator />
        <CommandGroup heading="Loading...">
          <CommandItem disabled>
            <Search className="h-4 w-4 mr-2 animate-spin" />
            Searching...
          </CommandItem>
        </CommandGroup>
      </>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

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
              className="cursor-pointer"
            >
              <Icon className="h-4 w-4 mr-2 text-muted-foreground" />
              <div className="flex flex-col items-start flex-1">
                <span className="font-medium">{displayName}</span>
                {subtitle && (
                  <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
                )}
              </div>
              <Badge variant="outline" className="ml-auto text-xs capitalize">
                {suggestion.type}
              </Badge>
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}