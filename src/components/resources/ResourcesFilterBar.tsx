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
    <div className="rounded-md border border-border bg-background p-4 md:p-6 mb-6">
      {/* Row 1: Search + View toggles */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="relative flex-1">
          <Search
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 20,
              height: 20,
              color: 'hsl(var(--muted-foreground))',
            }}
          />
          <Input
            placeholder="Search tags, categories, descriptions..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            style={{ paddingLeft: 48, height: 44, fontSize: '1rem' }}
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
              style={{ height: 44, width: 44, padding: 0 }}
              onClick={() => onDisplayModeChange(mode)}
              title={`${label} view`}
            >
              <Icon style={{ width: 18, height: 18 }} />
            </Button>
          ))}
          <div className="w-px bg-border mx-1" />
          <Button
            variant={viewMode === 'graph' ? 'default' : 'secondary'}
            size="lg"
            style={{ height: 44, width: 44, padding: 0 }}
            onClick={onToggleGraph}
            title="Tag Relationship Graph"
          >
            <Network style={{ width: 18, height: 18 }} />
          </Button>
        </div>
      </div>

      {/* Row 2: Filters + Sort */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
          <SelectTrigger style={{ width: 220, height: 40 }}>
            <Filter style={{ width: 16, height: 16, marginRight: 8, flexShrink: 0 }} />
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
                      <span style={{ paddingLeft: 16, fontSize: '0.85em', opacity: 0.85 }}>
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
            <BarChart3 style={{ width: 16, height: 16, marginRight: 8, flexShrink: 0 }} />
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
          style={{ height: 40 }}
          onClick={() => onHasImageFilterChange(!hasImageFilter)}
          title="Only show tags with images"
        >
          <Image style={{ width: 16, height: 16, marginRight: 6 }} />
          Has Image
        </Button>

        <div className="ml-auto flex gap-2 items-center">
          <Select
            value={sortBy}
            onValueChange={(value: string) => onSortByChange(value as SortOption)}
          >
            <SelectTrigger style={{ width: 150, height: 40 }}>
              <TrendingUp style={{ width: 16, height: 16, marginRight: 8, flexShrink: 0 }} />
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
            style={{ height: 40, width: 40, padding: 0 }}
            onClick={onSortDirectionToggle}
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? (
              <SortAsc style={{ width: 16, height: 16 }} />
            ) : (
              <SortDesc style={{ width: 16, height: 16 }} />
            )}
          </Button>
        </div>
      </div>

      {/* Active filters summary */}
      {(filterCategory !== 'all' || usageFilter !== 'all' || hasImageFilter) && (
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          <span className="text-xs text-muted-foreground">Active:</span>
          {filterCategory !== 'all' && (
            <button
              type="button"
              onClick={() => onFilterCategoryChange('all')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              {getCategoryShortName(filterCategory)} ✕
            </button>
          )}
          {usageFilter !== 'all' && (
            <button
              type="button"
              onClick={() => onUsageFilterChange('all')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              {usageFilter === 'used' ? 'Used' : 'Unused'} ✕
            </button>
          )}
          {hasImageFilter && (
            <button
              type="button"
              onClick={() => onHasImageFilterChange(false)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              Has Image ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onFilterCategoryChange('all');
              onUsageFilterChange('all');
              onHasImageFilterChange(false);
            }}
            className="cursor-pointer text-xs text-muted-foreground hover:text-primary"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
