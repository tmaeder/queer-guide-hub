import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { Search, Users, Lock, Globe } from '@/components/icons';
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
 * Search, one row of toggle chips and a tag picker. The chips show their own
 * active state, so there is no separate "active filters" row; "My groups" is
 * the tab above, not a filter here.
 */
export const GroupFilters = ({
  searchQuery,
  onSearchChange,
  activeFilters,
  onFilterChange,
  selectedTags,
  onTagsChange,
}: GroupFiltersProps) => {
  const toggleFilter = (id: string) =>
    onFilterChange(
      activeFilters.includes(id) ? activeFilters.filter((f) => f !== id) : [...activeFilters, id],
    );

  const hasActiveFilters = activeFilters.length > 0 || !!searchQuery || selectedTags.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Search groups"
          className="border-0 bg-surface-container pl-10 text-foreground placeholder:text-muted-foreground"
          placeholder="Search groups"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {filterOptions.map(({ id, label, icon: Icon }) => (
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
            Clear
          </Button>
        )}
      </div>

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
  );
};
