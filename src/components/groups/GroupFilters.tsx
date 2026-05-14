import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Users, Lock, Globe, X } from "lucide-react";
import { TagSelector } from "@/components/tags/TagSelector";

interface GroupFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilters: string[];
  onFilterChange: (filters: string[]) => void;
  showMyGroups: boolean;
  onShowMyGroupsChange: (show: boolean) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

const filterOptions = [
  { id: "public", label: "Public", icon: Globe },
  { id: "private", label: "Private", icon: Lock },
  { id: "small", label: "Small (< 50)", icon: Users },
  { id: "medium", label: "Medium (50-200)", icon: Users },
  { id: "large", label: "Large (200+)", icon: Users },
];

function FilterChip({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        type="button"
        onClick={onDelete}
        className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
        aria-label="Remove filter"
      >
        <X style={{ width: 10, height: 10 }} />
      </button>
    </Badge>
  );
}

export const GroupFilters = ({
  searchQuery,
  onSearchChange,
  activeFilters,
  onFilterChange,
  showMyGroups,
  onShowMyGroupsChange,
  selectedTags,
  onTagsChange
}: GroupFiltersProps) => {
  const toggleFilter = (filterId: string) => {
    if (activeFilters.includes(filterId)) {
      onFilterChange(activeFilters.filter(f => f !== filterId));
    } else {
      onFilterChange([...activeFilters, filterId]);
    }
  };

  const clearAllFilters = () => {
    onFilterChange([]);
    onSearchChange("");
    onShowMyGroupsChange(false);
    onTagsChange([]);
  };

  const hasActiveFilters = activeFilters.length > 0 || searchQuery || showMyGroups || selectedTags.length > 0;

  return (
    <Card>
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
              }}
              color="hsl(var(--muted-foreground))"
            />
            <Input
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ paddingLeft: 40 }}
            />
          </div>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllFilters}
            >
              <span className="flex items-center gap-1">
                <X style={{ width: 12, height: 12 }} />
                Clear
              </span>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={showMyGroups ? "default" : "outline"}
            size="sm"
            onClick={() => onShowMyGroupsChange(!showMyGroups)}
          >
            My Groups
          </Button>

          {filterOptions.map((option) => {
            const Icon = option.icon;
            const isActive = activeFilters.includes(option.id);

            return (
              <Button
                key={option.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => toggleFilter(option.id)}
              >
                <span className="flex items-center gap-1">
                  <Icon style={{ width: 12, height: 12 }} />
                  {option.label}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tags">Filter by Tags</Label>
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={onTagsChange}
            placeholder="Filter groups by tags..."
            maxTags={3}
            allowCustomTags={false}
          />
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1">
            {searchQuery && (
              <FilterChip
                label={`Search: "${searchQuery}"`}
                onDelete={() => onSearchChange("")}
              />
            )}
            {showMyGroups && (
              <FilterChip
                label="My Groups"
                onDelete={() => onShowMyGroupsChange(false)}
              />
            )}
            {selectedTags.map((tag) => (
              <FilterChip
                key={tag}
                label={`Tag: ${tag}`}
                onDelete={() => onTagsChange(selectedTags.filter(t => t !== tag))}
              />
            ))}
            {activeFilters.map((filter) => {
              const option = filterOptions.find(opt => opt.id === filter);
              return (
                <FilterChip
                  key={filter}
                  label={option?.label || filter}
                  onDelete={() => toggleFilter(filter)}
                />
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};
