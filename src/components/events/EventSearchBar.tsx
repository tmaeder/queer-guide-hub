import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter } from 'lucide-react';

interface EventSearchBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}

/** Events search input + filters-panel toggle. */
export function EventSearchBar({
  search,
  onSearchChange,
  onSearch,
  showFilters,
  onToggleFilters,
}: EventSearchBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="flex-1 basis-full sm:basis-auto min-w-0 flex items-center gap-2 rounded-element px-4 py-2 bg-background">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          aria-label={t('pages.events.searchLabel', 'Search events')}
          placeholder={t('pages.events.searchPlaceholder', 'Search events, cities, organizers')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          className="border-0 shadow-none p-0 h-auto bg-transparent focus:ring-0 focus:border-0 flex-1 min-w-0"
        />
      </div>
      <Button
        variant="outline"
        onClick={onToggleFilters}
        aria-label={showFilters ? 'Hide filters' : 'Show filters'}
        aria-expanded={showFilters}
        style={{ display: 'inline-flex', gap: 8 }}
      >
        <Filter size={16} />
        {t('pages.events.filters', 'Filters')}
      </Button>
    </div>
  );
}
