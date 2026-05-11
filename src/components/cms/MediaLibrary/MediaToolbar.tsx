import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Grid, List, RefreshCw, Archive } from 'lucide-react';
import type { ViewMode, SortBy, SortDir, StatusFilter, EntityTypeFilter } from './types';

interface MediaToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  entityTypeFilter: EntityTypeFilter;
  onEntityTypeFilterChange: (v: EntityTypeFilter) => void;
  sortBy: SortBy;
  onSortByChange: (v: SortBy) => void;
  sortDir: SortDir;
  onSortDirChange: (v: SortDir) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  bulkMode: boolean;
  onBulkModeToggle: () => void;
  onRefresh: () => void;
}

export function MediaToolbar(props: MediaToolbarProps) {
  const {
    search, onSearchChange,
    statusFilter, onStatusFilterChange,
    entityTypeFilter, onEntityTypeFilterChange,
    sortBy, onSortByChange,
    viewMode, onViewModeChange,
    bulkMode, onBulkModeToggle,
    onRefresh,
  } = props;

  return (
    <div className="flex flex-col lg:flex-row gap-3 p-4 border border-border">
      <div className="relative flex-1 md:max-w-sm">
        <Search
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            height: 14, width: 14, color: 'var(--muted-foreground)',
          }}
        />
        <Input
          placeholder="Search... (alt: format: size:>1mb dim:>1920)"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ paddingLeft: 32, fontSize: '0.875rem' }}
        />
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Select value={entityTypeFilter} onValueChange={(v) => onEntityTypeFilterChange(v as EntityTypeFilter)}>
          <SelectTrigger style={{ width: 140, fontSize: '0.875rem' }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="venue">Venues</SelectItem>
            <SelectItem value="event">Events</SelectItem>
            <SelectItem value="news_article">News</SelectItem>
            <SelectItem value="personality">Personalities</SelectItem>
            <SelectItem value="marketplace_listing">Marketplace</SelectItem>
            <SelectItem value="city">Cities</SelectItem>
            <SelectItem value="country">Countries</SelectItem>
            <SelectItem value="queer_village">Villages</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
          <SelectTrigger style={{ width: 130, fontSize: '0.875rem' }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="optimized">Optimized</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
            <SelectItem value="starred">Starred</SelectItem>
            <SelectItem value="unused">Unused</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortBy)}>
          <SelectTrigger style={{ width: 130, fontSize: '0.875rem' }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date</SelectItem>
            <SelectItem value="display_name">Name</SelectItem>
            <SelectItem value="file_size">Size</SelectItem>
            <SelectItem value="usage_count">Usage</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex border border-border">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
          >
            <Grid style={{ height: 14, width: 14 }} />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('list')}
            style={{ borderLeft: '1px solid var(--border)' }}
          >
            <List style={{ height: 14, width: 14 }} />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={onBulkModeToggle}>
          <Archive style={{ height: 14, width: 14, marginRight: 4 }} />
          {bulkMode ? 'Exit Bulk' : 'Bulk'}
        </Button>

        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw style={{ height: 14, width: 14 }} />
        </Button>
      </div>
    </div>
  );
}
