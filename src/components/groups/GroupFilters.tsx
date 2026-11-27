import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { Search, Users, Lock, Globe, Filter } from '@/components/icons';
import { TagSelector } from '@/components/tags/TagSelector';

interface GroupFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilters: string[];
  onFilterChange: (filters: string[]) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

const filterOptions = [
  { id: 'public', label: 'Public', icon: Globe },
  { id: 'private', label: 'Private', icon: Lock },
  { id: 'small', label: 'Under 50', icon: Users },
  { id: 'medium', label: '50–200', icon: Users },
  { id: 'large', label: '200+', icon: Users },
];

/**
 * Search stays visible. Additional filters are disclosed on demand; selected
 * filters remain visible when the panel closes. My groups remains a directory
 * view rather than a second filter for the same thing.
 */
export const GroupFilters = ({
  searchQuery,
  onSearchChange,
  activeFilters,
  onFilterChange,
  selectedTags,
  onTagsChange,
}: GroupFiltersProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = activeFilters.length + selectedTags.length;
  const toggleFilter = (id: string) =>
    onFilterChange(
      activeFilters.includes(id) ? activeFilters.filter((f) => f !== id) : [...activeFilters, id],
    );

  const hasActiveFilters = activeFilters.length > 0 || !!searchQuery || selectedTags.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search groups"
            className="pl-10"
            placeholder="Search groups"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <Button
          variant="outline"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <Filter size={16} aria-hidden />
          {t('common.filters', 'Filters')}
          {count > 0 && ` (${count})`}
        </Button>
      </div>
      {(open || hasActiveFilters) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filterOptions
            .filter(({ id }) => open || activeFilters.includes(id))
            .map(({ id, label, icon: Icon }) => (
              <ToggleChip
                key={id}
                pressed={activeFilters.includes(id)}
                onPressedChange={() => toggleFilter(id)}
                icon={<Icon size={14} aria-hidden />}
              >
                {label}
              </ToggleChip>
            ))}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onFilterChange([]);
                onSearchChange('');
                onTagsChange([]);
              }}
            >
              {t('common.clear', 'Clear')}
            </Button>
          )}
        </div>
      )}

      <div id={panelId} hidden={!open}>
        <TagSelector
          borderless
          compact
          selectedTags={selectedTags}
          onTagsChange={onTagsChange}
          placeholder="Filter by tags"
          maxTags={3}
          allowCustomTags={false}
        />
      </div>
    </div>
  );
};
