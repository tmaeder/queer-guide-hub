import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Search } from "lucide-react";
import { SearchSuggestion } from "@/hooks/useSearchSuggestions";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
        <CommandGroup heading="Searching...">
          <CommandItem disabled>
            <Search style={{ height: 16, width: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
            Finding results...
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

            >
              <Box component={Icon} sx={{ height: 16, width: 16, mr: 1.5, color: 'text.secondary', flexShrink: 0 }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{displayName}</Typography>
                {subtitle && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{subtitle}</Typography>
                )}
              </Box>
              <Badge
                variant="outline"

              >
                {suggestion.type}
              </Badge>
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}
