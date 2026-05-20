import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  Sliders,
  ChevronDown,
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
  const { t } = useTranslation();
  const advancedActive = usageFilter !== 'all' || hasImageFilter || sortDirection !== 'desc';
  const [advancedOpen, setAdvancedOpen] = useState(advancedActive);

  return (
    <div className="rounded-element border border-border bg-background p-4 md:p-6 mb-6">
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
            placeholder={t('resources.filter.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            aria-label={t('resources.filter.searchAria')}
            style={{ paddingLeft: 48, height: 44, fontSize: '1rem' }}
          />
        </div>
        <div className="flex gap-1">
          {[
            { mode: 'chips' as DisplayMode, icon: Tag, label: t('resources.filter.view.chips') },
            { mode: 'grid' as DisplayMode, icon: LayoutGrid, label: t('resources.filter.view.grid') },
            { mode: 'list' as DisplayMode, icon: List, label: t('resources.filter.view.list') },
          ].map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              variant={displayMode === mode ? 'default' : 'secondary'}
              size="lg"
              style={{ height: 44, width: 44, padding: 0 }}
              onClick={() => onDisplayModeChange(mode)}
              title={`${label}${t('resources.filter.view.ariaSuffix')}`}
              aria-label={`${label}${t('resources.filter.view.ariaSuffix')}`}
              aria-pressed={displayMode === mode}
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
            title={t('resources.filter.graph')}
            aria-label={t('resources.filter.graph')}
            aria-pressed={viewMode === 'graph'}
          >
            <Network style={{ width: 18, height: 18 }} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
          <SelectTrigger style={{ width: 220, height: 40 }} aria-label={t('resources.filter.filterAria')}>
            <Filter style={{ width: 16, height: 16, marginRight: 8, flexShrink: 0 }} />
            <SelectValue placeholder={t('resources.filter.categoryPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('resources.filter.allCategories')}</SelectItem>
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

        <Select
          value={sortBy}
          onValueChange={(value: string) => onSortByChange(value as SortOption)}
        >
          <SelectTrigger style={{ width: 150, height: 40 }} aria-label={t('resources.filter.sortAria')}>
            <TrendingUp style={{ width: 16, height: 16, marginRight: 8, flexShrink: 0 }} />
            <SelectValue placeholder={t('resources.filter.sortPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="usage">{t('resources.filter.sortMostUsed')}</SelectItem>
            <SelectItem value="alphabetical">{t('resources.filter.sortAlphabetical')}</SelectItem>
            <SelectItem value="recent">{t('resources.filter.sortNewest')}</SelectItem>
          </SelectContent>
        </Select>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="ml-auto">
          <CollapsibleTrigger asChild>
            <Button
              variant={advancedActive ? 'default' : 'ghost'}
              size="sm"
              style={{ height: 40 }}
              aria-expanded={advancedOpen}
            >
              <Sliders style={{ width: 14, height: 14, marginRight: 6 }} />
              {t('resources.filter.advanced')}
              <ChevronDown
                style={{
                  width: 14,
                  height: 14,
                  marginLeft: 6,
                  transition: 'transform 150ms',
                  transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0)',
                }}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="w-full mt-3 flex flex-wrap gap-3 items-center">
            <Select value={usageFilter} onValueChange={onUsageFilterChange}>
              <SelectTrigger style={{ width: 140, height: 40 }} aria-label={t('resources.filter.usageAria')}>
                <BarChart3 style={{ width: 16, height: 16, marginRight: 8, flexShrink: 0 }} />
                <SelectValue placeholder={t('resources.filter.usagePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('resources.filter.usageAll')}</SelectItem>
                <SelectItem value="used">{t('resources.filter.usageUsed')}</SelectItem>
                <SelectItem value="unused">{t('resources.filter.usageUnused')}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={hasImageFilter ? 'default' : 'secondary'}
              size="sm"
              style={{ height: 40 }}
              onClick={() => onHasImageFilterChange(!hasImageFilter)}
              title={t('resources.filter.hasImageTitle')}
              aria-label={t('resources.filter.hasImageTitle')}
              aria-pressed={hasImageFilter}
            >
              <Image style={{ width: 16, height: 16, marginRight: 6 }} />
              {t('resources.filter.hasImage')}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              style={{ height: 40, width: 40, padding: 0 }}
              onClick={onSortDirectionToggle}
              title={sortDirection === 'asc' ? t('resources.filter.sortDirAsc') : t('resources.filter.sortDirDesc')}
              aria-label={sortDirection === 'asc' ? t('resources.filter.sortDirAsc') : t('resources.filter.sortDirDesc')}
              aria-pressed={sortDirection === 'desc'}
            >
              {sortDirection === 'asc' ? (
                <SortAsc style={{ width: 16, height: 16 }} />
              ) : (
                <SortDesc style={{ width: 16, height: 16 }} />
              )}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {(filterCategory !== 'all' || usageFilter !== 'all' || hasImageFilter) && (
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          <span className="text-xs text-muted-foreground">{t('resources.filter.active')}</span>
          {filterCategory !== 'all' && (
            <button
              type="button"
              onClick={() => onFilterCategoryChange('all')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              {getCategoryShortName(filterCategory)} ✕
            </button>
          )}
          {usageFilter !== 'all' && (
            <button
              type="button"
              onClick={() => onUsageFilterChange('all')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              {usageFilter === 'used' ? t('resources.filter.usageUsed') : t('resources.filter.usageUnused')} ✕
            </button>
          )}
          {hasImageFilter && (
            <button
              type="button"
              onClick={() => onHasImageFilterChange(false)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge cursor-pointer bg-secondary text-xs hover:opacity-80"
            >
              {t('resources.filter.hasImage')} ✕
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
            {t('resources.filter.clearAll')}
          </button>
        </div>
      )}
    </div>
  );
}
