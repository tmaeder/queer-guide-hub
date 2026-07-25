import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Grid,
  List,
  RefreshCw,
  Archive,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import type {
  ViewMode,
  SortBy,
  SortDir,
  StatusFilter,
  EntityTypeFilter,
  FormatFilter,
  SourceTypeFilter,
  AccessLevelFilter,
  BrandCategoryFilter,
} from './types';
import { ACCESS_LEVELS, BRAND_CATEGORIES } from './types';

interface MediaToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  entityTypeFilter: EntityTypeFilter;
  onEntityTypeFilterChange: (v: EntityTypeFilter) => void;
  formatFilter: FormatFilter;
  onFormatFilterChange: (v: FormatFilter) => void;
  sourceTypeFilter: SourceTypeFilter;
  onSourceTypeFilterChange: (v: SourceTypeFilter) => void;
  accessFilter?: AccessLevelFilter;
  onAccessFilterChange?: (v: AccessLevelFilter) => void;
  brandCategoryFilter?: BrandCategoryFilter;
  onBrandCategoryFilterChange?: (v: BrandCategoryFilter) => void;
  tagFilter?: string[];
  onTagFilterChange?: (v: string[]) => void;
  sortBy: SortBy;
  onSortByChange: (v: SortBy) => void;
  sortDir: SortDir;
  onSortDirToggle: () => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  bulkMode: boolean;
  onBulkModeToggle: () => void;
  onRefresh: () => void;
}

export function MediaToolbar(props: MediaToolbarProps) {
  const {
    search,
    onSearchChange,
    statusFilter,
    onStatusFilterChange,
    entityTypeFilter,
    onEntityTypeFilterChange,
    formatFilter,
    onFormatFilterChange,
    sourceTypeFilter,
    onSourceTypeFilterChange,
    accessFilter = 'all',
    onAccessFilterChange,
    brandCategoryFilter = 'all',
    onBrandCategoryFilterChange,
    tagFilter = [],
    onTagFilterChange,
    sortBy,
    onSortByChange,
    sortDir,
    onSortDirToggle,
    viewMode,
    onViewModeChange,
    bulkMode,
    onBulkModeToggle,
    onRefresh,
  } = props;

  const [tagDraft, setTagDraft] = useState('');

  const addTag = () => {
    const slug = tagDraft.trim().toLowerCase();
    if (slug && !tagFilter.includes(slug)) {
      onTagFilterChange?.([...tagFilter, slug]);
    }
    setTagDraft('');
  };

  const activeFilterCount = [
    statusFilter !== 'all',
    entityTypeFilter !== 'all',
    formatFilter !== 'all',
    sourceTypeFilter !== 'all',
    accessFilter !== 'all',
    brandCategoryFilter !== 'all',
  ].filter(Boolean).length + tagFilter.length;

  return (
    <div className="flex flex-col gap-4 p-4 border border-border">
      {/* Row 1: Search + view controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search
            style={{ left: 10, top: '50%', transform: 'translateY(-50%)', height: 14, width: 14 }}
            className="absolute text-muted-foreground"
          />
          <Input
            placeholder="Search name, alt text, URL... (alt: format: size:>1mb dim:>1920)"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ paddingLeft: 32, fontSize: '0.875rem' }}
          />
        </div>

        <div className="flex gap-1 items-center">
          <div className="flex border border-border">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('grid')}
            >
              <Grid size={14} />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('list')}
              style={{ borderLeft: '1px solid var(--border)' }}
            >
              <List size={14} />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={onBulkModeToggle}>
            <Archive size={14} className="mr-1" />
            {bulkMode ? 'Exit Bulk' : 'Bulk'}
          </Button>

          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Row 2: Filters + Sort */}
      <div className="flex gap-2 items-center flex-wrap">
        {activeFilterCount > 0 && (
          <span className="text-xs text-muted-foreground font-medium">
            {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </span>
        )}

        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
          <SelectTrigger style={{ width: 140 }} className="text-13">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="optimized">Optimized</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
            <SelectItem value="starred">Starred</SelectItem>
            <SelectItem value="unused">Unused</SelectItem>
            <SelectItem value="no_alt">No Alt Text</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={entityTypeFilter}
          onValueChange={(v) => onEntityTypeFilterChange(v as EntityTypeFilter)}
        >
          <SelectTrigger style={{ width: 140 }} className="text-13">
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

        <Select value={formatFilter} onValueChange={(v) => onFormatFilterChange(v as FormatFilter)}>
          <SelectTrigger style={{ width: 110 }} className="text-13">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="jpeg">JPEG</SelectItem>
            <SelectItem value="png">PNG</SelectItem>
            <SelectItem value="webp">WebP</SelectItem>
            <SelectItem value="avif">AVIF</SelectItem>
            <SelectItem value="gif">GIF</SelectItem>
            <SelectItem value="svg">SVG</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sourceTypeFilter}
          onValueChange={(v) => onSourceTypeFilterChange(v as SourceTypeFilter)}
        >
          <SelectTrigger style={{ width: 120 }} className="text-13">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="image_asset">Image Assets</SelectItem>
            <SelectItem value="cms_media">CMS Uploads</SelectItem>
          </SelectContent>
        </Select>

        <Select value={accessFilter} onValueChange={(v) => onAccessFilterChange?.(v as AccessLevelFilter)}>
          <SelectTrigger style={{ width: 120 }} className="text-13">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Access</SelectItem>
            {ACCESS_LEVELS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={brandCategoryFilter} onValueChange={(v) => onBrandCategoryFilterChange?.(v as BrandCategoryFilter)}>
          <SelectTrigger style={{ width: 130 }} className="text-13">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {BRAND_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="border-l border-border h-6 mx-1" />

        <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortBy)}>
          <SelectTrigger style={{ width: 120 }} className="text-13">
            <ArrowUpDown size={12} className="mr-1 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Created</SelectItem>
            <SelectItem value="updated_at">Updated</SelectItem>
            <SelectItem value="display_name">Name</SelectItem>
            <SelectItem value="file_size">Size</SelectItem>
            <SelectItem value="usage_count">Usage</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={onSortDirToggle}
          className="px-2"
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </Button>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => {
              onStatusFilterChange('all');
              onEntityTypeFilterChange('all');
              onFormatFilterChange('all');
              onSourceTypeFilterChange('all');
              onAccessFilterChange?.('all');
              onBrandCategoryFilterChange?.('all');
              onTagFilterChange?.([]);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Row 3: Tag filter chips */}
      <div className="flex gap-2 items-center flex-wrap">
        <TagIcon size={13} className="text-muted-foreground shrink-0" />
        {tagFilter.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => onTagFilterChange?.(tagFilter.filter((x) => x !== t))}
              className="ml-0.5"
            >
              <X size={11} />
            </button>
          </Badge>
        ))}
        <Input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(); }
          }}
          placeholder="Filter by tag slug…"
          style={{ width: 180, fontSize: '0.8125rem' }}
        />
      </div>
    </div>
  );
}
