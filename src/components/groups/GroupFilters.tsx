import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Search, Filter, Users, Lock, Globe, X } from "lucide-react";
import { TagSelector } from "@/components/tags/TagSelector";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

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
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ position: 'relative', flex: 1 }}>
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
          </Box>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllFilters}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <X style={{ width: 12, height: 12 }} />
                Clear
              </Box>
            </Button>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Icon style={{ width: 12, height: 12 }} />
                  {option.label}
                </Box>
              </Button>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Label htmlFor="tags">Filter by Tags</Label>
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={onTagsChange}
            placeholder="Filter groups by tags..."
            maxTags={3}
            allowCustomTags={false}
          />
        </Box>

        {hasActiveFilters && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {searchQuery && (
              <Chip
                label={`Search: "${searchQuery}"`}
                size="small"
                onDelete={() => onSearchChange("")}
              />
            )}
            {showMyGroups && (
              <Chip
                label="My Groups"
                size="small"
                onDelete={() => onShowMyGroupsChange(false)}
              />
            )}
            {selectedTags.map((tag) => (
              <Chip
                key={tag}
                label={`Tag: ${tag}`}
                size="small"
                onDelete={() => onTagsChange(selectedTags.filter(t => t !== tag))}
              />
            ))}
            {activeFilters.map((filter) => {
              const option = filterOptions.find(opt => opt.id === filter);
              return (
                <Chip
                  key={filter}
                  label={option?.label}
                  size="small"
                  onDelete={() => toggleFilter(filter)}
                />
              );
            })}
          </Box>
        )}
      </Box>
    </Card>
  );
};
