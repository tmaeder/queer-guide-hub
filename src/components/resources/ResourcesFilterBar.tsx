import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
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
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3, bgcolor: 'background.paper' }}>
      {/* Row 1: Search + View toggles */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}>
        <Box sx={{ position: 'relative', flex: 1 }}>
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
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
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
          <Box sx={{ width: '1px', bgcolor: 'divider', mx: 0.5 }} />
          <Button
            variant={viewMode === 'graph' ? 'default' : 'secondary'}
            size="lg"
            style={{ height: 44, width: 44, padding: 0 }}
            onClick={onToggleGraph}
            title="Tag Relationship Graph"
          >
            <Network style={{ width: 18, height: 18 }} />
          </Button>
        </Box>
      </Box>

      {/* Row 2: Filters + Sort */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
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

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
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
        </Box>
      </Box>

      {/* Active filters summary */}
      {(filterCategory !== 'all' || usageFilter !== 'all' || hasImageFilter) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2, alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Active:
          </Typography>
          {filterCategory !== 'all' && (
            <Box
              onClick={() => onFilterCategoryChange('all')}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: 'secondary.main',
                fontSize: '0.75rem',
                '&:hover': { opacity: 0.8 },
              }}
            >
              {getCategoryShortName(filterCategory)} ✕
            </Box>
          )}
          {usageFilter !== 'all' && (
            <Box
              onClick={() => onUsageFilterChange('all')}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: 'secondary.main',
                fontSize: '0.75rem',
                '&:hover': { opacity: 0.8 },
              }}
            >
              {usageFilter === 'used' ? 'Used' : 'Unused'} ✕
            </Box>
          )}
          {hasImageFilter && (
            <Box
              onClick={() => onHasImageFilterChange(false)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: 'secondary.main',
                fontSize: '0.75rem',
                '&:hover': { opacity: 0.8 },
              }}
            >
              Has Image ✕
            </Box>
          )}
          <Box
            onClick={() => {
              onFilterCategoryChange('all');
              onUsageFilterChange('all');
              onHasImageFilterChange(false);
            }}
            sx={{
              cursor: 'pointer',
              fontSize: '0.75rem',
              color: 'text.secondary',
              '&:hover': { color: 'primary.main' },
            }}
          >
            Clear all
          </Box>
        </Box>
      )}
    </Paper>
  );
}
