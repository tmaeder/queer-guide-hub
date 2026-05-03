import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Filter,
  TrendingUp,
  BarChart3,
  Image,
  Network,
  Tag,
  LayoutGrid,
  List,
  SortAsc,
  SortDesc,
} from 'lucide-react';
import { getCategoryShortName, parentOrder } from './categoryMeta';
import type { CategoryTreeNode } from '@/hooks/useCentralizedTags';

type DisplayMode = 'chips' | 'grid' | 'list';
type SortOption = 'alphabetical' | 'usage' | 'recent';

interface ResourcesFilterBarProps {
  searchQuery: string;
  onSearch: (query: string) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  viewMode: string;
  onToggleGraph: () => void;
  filterCategory: string;
  onFilterCategoryChange: (val: string) => void;
  usageFilter: string;
  onUsageFilterChange: (val: string) => void;
  hasImageFilter: boolean;
  onHasImageFilterChange: (val: boolean) => void;
  sortBy: SortOption;
  onSortByChange: (val: SortOption) => void;
  sortDirection: 'asc' | 'desc';
  onSortDirectionToggle: () => void;
  categoriesTree: CategoryTreeNode[];
}

export function ResourcesFilterBar({
  searchQuery,
  onSearch,
  displayMode,
  onDisplayModeChange,
  viewMode,
  onToggleGraph,
  filterCategory,
  onFilterCategoryChange,
  usageFilter,
  onUsageFilterChange,
  hasImageFilter,
  onHasImageFilterChange,
  sortBy,
  onSortByChange,
  sortDirection,
  onSortDirectionToggle,
  categoriesTree,
}: ResourcesFilterBarProps) {
  return (
    <div className="border border-border rounded-md p-4 md:p-6 mb-6 bg-background">
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search tags, categories, descriptions..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-12 h-11 text-base"
          />
        </div>
        <div className="flex gap-1">
          {[
            { mode: 'chips' as DisplayMode, icon: Tag, label: 'Chips' },
            { mode: 'grid' as DisplayMode, icon: LayoutGrid, label: 'Grid' },
            { mode: 'list' as DisplayMode, icon: List, label: 'List' },
          ].map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              variant={displayMode === mode ? 'default' : 'secondary'}
              size="lg"
              className="h-11 w-11 p-0"
              onClick={() => onDisplayModeChange(mode)}
              title={`${label} view`}
            >
              <Icon className="w-[18px] h-[18px]" />
            </Button>
          ))}
          <div className="w-px bg-border mx-1" />
          <Button
            variant={viewMode === 'graph' ? 'default' : 'secondary'}
            size="lg"
            className="h-11 w-11 p-0"
            onClick={onToggleGraph}
            title="Tag Relationship Graph"
          >
            <Network className="w-[18px] h-[18px]" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
          <SelectTrigger style={{ width: 220, height: 40 }}>
            <Filter className="w-4 h-4 mr-2 shrink-0" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {parentOrder
              .map((name) => categoriesTree.find((c) => c.name === name))
              .filter((cat): cat is CategoryTreeNode => !!cat)
              .map((cat) => (
                <React.Fragment key={cat.id}>
                  <SelectItem value={cat.name}>{getCategoryShortName(cat.name)}</SelectItem>
                  {cat.children.map((child) => (
                    <SelectItem key={child.id} value={child.name}>
                      <span className="pl-4 text-[0.85em] opacity-85">
                        {getCategoryShortName(child.name)}
                      </span>
                    </SelectItem>
                  ))}
                </React.Fragment>
              ))}
          </SelectContent>
        </Select>

        <Select value={usageFilter} onValueChange={onUsageFilterChange}>
          <SelectTrigger style={{ width: 140, height: 40 }}>
            <BarChart3 className="w-4 h-4 mr-2 shrink-0" />
            <SelectValue placeholder="Usage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="unused">Unused</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={hasImageFilter ? 'default' : 'secondary'}
          size="sm"
          className="h-10"
          onClick={() => onHasImageFilterChange(!hasImageFilter)}
          title="Only show tags with images"
        >
          <Image className="w-4 h-4 mr-1.5" />
          Has Image
        </Button>

        <div className="ml-auto flex gap-2 items-center">
          <Select
            value={sortBy}
            onValueChange={(value: string) => onSortByChange(value as SortOption)}
          >
            <SelectTrigger style={{ width: 150, height: 40 }}>
              <TrendingUp className="w-4 h-4 mr-2 shrink-0" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="usage">Most Used</SelectItem>
              <SelectItem value="alphabetical">A-Z</SelectItem>
              <SelectItem value="recent">Newest</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={onSortDirectionToggle}
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? (
              <SortAsc className="w-4 h-4" />
            ) : (
              <SortDesc className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {(filterCategory !== 'all' || usageFilter !== 'all' || hasImageFilter) && (
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          <span className="text-xs text-muted-foreground">Active:</span>
          {filterCategory !== 'all' && (
            <span
              onClick={() => onFilterCategoryChange('all')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              {getCategoryShortName(filterCategory)} ✕
            </span>
          )}
          {usageFilter !== 'all' && (
            <span
              onClick={() => onUsageFilterChange('all')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              {usageFilter === 'used' ? 'Used' : 'Unused'} ✕
            </span>
          )}
          {hasImageFilter && (
            <span
              onClick={() => onHasImageFilterChange(false)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              Has Image ✕
            </span>
          )}
          <span
            onClick={() => {
              onFilterCategoryChange('all');
              onUsageFilterChange('all');
              onHasImageFilterChange(false);
            }}
            className="cursor-pointer text-xs text-muted-foreground hover:text-primary"
          >
            Clear all
          </span>
        </div>
      )}
    </div>
  );
}
