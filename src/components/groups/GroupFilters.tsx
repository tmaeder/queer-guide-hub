import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Search, Filter, Users, Lock, Globe, X } from "lucide-react";
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
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllFilters}
            className="flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={showMyGroups ? "default" : "outline"}
          size="sm"
          onClick={() => onShowMyGroupsChange(!showMyGroups)}
          className={showMyGroups ? "bg-gradient-primary" : ""}
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
              className={`flex items-center gap-1 ${isActive ? "bg-gradient-primary" : ""}`}
            >
              <Icon className="h-3 w-3" />
              {option.label}
            </Button>
          );
        })}
      </div>

      <div className="space-y-2">
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
            <Badge variant="secondary" className="flex items-center gap-1">
              Search: "{searchQuery}"
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => onSearchChange("")}
              />
            </Badge>
          )}
          {showMyGroups && (
            <Badge variant="secondary" className="flex items-center gap-1">
              My Groups
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => onShowMyGroupsChange(false)}
              />
            </Badge>
          )}
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
              Tag: {tag}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => onTagsChange(selectedTags.filter(t => t !== tag))}
              />
            </Badge>
          ))}
          {activeFilters.map((filter) => {
            const option = filterOptions.find(opt => opt.id === filter);
            return (
              <Badge key={filter} variant="secondary" className="flex items-center gap-1">
                {option?.label}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => toggleFilter(filter)}
                />
              </Badge>
            );
          })}
        </div>
      )}
    </Card>
  );
};