import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, MapPin, DollarSign, X, Layers, Users } from 'lucide-react';
import { SearchFilters, FacetDistribution } from '@/hooks/useSearch';
import { trackSearchUx } from '@/lib/searchClient';
import { useTopicClusters } from '@/hooks/useTopicClusters';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import type { SearchFilterKey } from '@/config/searchTypeConfig';

interface SearchFiltersPanelProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  /** P1-7: optional escape hatch so the parent can also clear its own search input. */
  onClearAll?: () => void;
  /** Meili/PG facet distribution — drives the drill-down lists with counts. */
  facets?: FacetDistribution;
  /** Which filter sections to render (from the active scope's config). */
  filterKeys?: SearchFilterKey[];
}

const ALL_KEYS: SearchFilterKey[] = [
  'geo',
  'category',
  'targetGroups',
  'date',
  'price',
  'free',
  'featured',
];

/** Facets rendered as refinement lists, in display order (all map to categories). */
const FACET_GROUPS: Array<{ facet: string; label: string }> = [
  { facet: 'category', label: 'Category' },
  { facet: 'subcategory', label: 'Subcategory' },
  { facet: 'tags', label: 'Tags' },
];
const MAX_FACET_VALUES = 8;
const MAX_TARGET_GROUPS = 12;

export const SearchFiltersPanel = ({
  filters,
  onFiltersChange,
  onClearAll,
  facets,
  filterKeys = ALL_KEYS,
}: SearchFiltersPanelProps) => {
  const { t } = useTranslation();
  const show = (k: SearchFilterKey) => filterKeys.includes(k);

  const selectedRange: DateRange | undefined = filters.dateRange
    ? { from: filters.dateRange[0], to: filters.dateRange[1] }
    : undefined;

  const { clusters, loading: clustersLoading } = useTopicClusters();

  const toggleCategory = (value: string, facet: string) => {
    const current = filters.categories ?? [];
    const isActive = current.some((v) => v.toLowerCase() === value.toLowerCase());
    const next = isActive
      ? current.filter((v) => v.toLowerCase() !== value.toLowerCase())
      : [...current, value];
    onFiltersChange({ ...filters, categories: next.length ? next : undefined });
    if (!isActive) void trackSearchUx('facet_apply', { facet, value });
  };

  const toggleTargetGroup = (value: string) => {
    const current = filters.target_groups ?? [];
    const isActive = current.includes(value);
    const next = isActive ? current.filter((v) => v !== value) : [...current, value];
    onFiltersChange({ ...filters, target_groups: next.length ? next : undefined });
    if (!isActive) void trackSearchUx('facet_apply', { facet: 'target_groups', value });
  };

  const toggleCluster = (clusterId: string) => {
    const current = filters.cluster_ids ?? [];
    const next = current.includes(clusterId)
      ? current.filter((id) => id !== clusterId)
      : [...current, clusterId];
    onFiltersChange({ ...filters, cluster_ids: next.length ? next : undefined });
  };

  const targetGroupValues = Object.entries(facets?.target_groups ?? {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TARGET_GROUPS);

  const hasAny =
    !!filters.location ||
    !!filters.priceRange ||
    !!filters.dateRange ||
    !!filters.free ||
    !!filters.featured ||
    (filters.categories?.length ?? 0) > 0 ||
    (filters.target_groups?.length ?? 0) > 0 ||
    (filters.cluster_ids?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Location */}
      {show('geo') && (
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1 text-sm font-medium">
            <MapPin className="h-3.5 w-3.5" />
            {t('search.filter.location', 'Location')}
          </Label>
          <div className="relative">
            <Input
              placeholder={t('search.filter.locationPh', 'City, region, or country…')}
              value={filters.location || ''}
              onChange={(e) => onFiltersChange({ ...filters, location: e.target.value || undefined })}
            />
            {filters.location && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-7 w-7 p-0"
                onClick={() => onFiltersChange({ ...filters, location: undefined })}
                aria-label={t('common.clear', 'Clear')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Date range */}
      {show('date') && (
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1 text-sm font-medium">
            <CalendarIcon className="h-3.5 w-3.5" />
            {t('search.filter.dates', 'Dates')}
          </Label>
          <DatePickerWithRange
            date={selectedRange}
            onSelect={(range) =>
              onFiltersChange({
                ...filters,
                dateRange: range?.from && range.to ? [range.from, range.to] : undefined,
              })
            }
          />
        </div>
      )}

      {/* Price + Free */}
      {(show('price') || show('free')) && (
        <div className="flex flex-col gap-4">
          {show('price') && (
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1 text-sm font-medium">
                <DollarSign className="h-3.5 w-3.5" />
                {t('search.filter.price', 'Price')}
              </Label>
              <div className="px-1">
                <Slider
                  value={filters.priceRange || [0, 1000]}
                  onValueChange={(r) => onFiltersChange({ ...filters, priceRange: [r[0], r[1]] })}
                  max={1000}
                  step={10}
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>${filters.priceRange?.[0] ?? 0}</span>
                  <span>
                    ${filters.priceRange?.[1] ?? 1000}
                    {(filters.priceRange?.[1] ?? 1000) >= 1000 ? '+' : ''}
                  </span>
                </div>
              </div>
            </div>
          )}
          {show('free') && (
            <div className="flex items-center gap-2">
              <Switch
                id="free-only"
                checked={filters.free || false}
                onCheckedChange={(checked) =>
                  onFiltersChange({ ...filters, free: checked || undefined })
                }
              />
              <Label htmlFor="free-only" className="text-sm">
                {t('search.filter.freeOnly', 'Free only')}
              </Label>
            </div>
          )}
        </div>
      )}

      {/* Target groups (audience) */}
      {show('targetGroups') && targetGroupValues.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1 text-sm font-medium">
            <Users className="h-3.5 w-3.5" />
            {t('search.filter.audience', 'Audience')}
          </Label>
          <div className="flex flex-wrap gap-1">
            {targetGroupValues.map(([value, count]) => {
              const active = filters.target_groups?.includes(value);
              return (
                <Badge
                  key={value}
                  variant={active ? 'default' : 'secondary'}
                  className="cursor-pointer text-xs capitalize"
                  onClick={() => toggleTargetGroup(value)}
                >
                  {value.replace(/_/g, ' ')}
                  <span className="ml-1 opacity-60">{count}</span>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Category facet drill-down + topics */}
      {show('category') && (
        <>
          {facets &&
            FACET_GROUPS.map((group) => {
              const dist = facets[group.facet];
              if (!dist) return null;
              const entries = Object.entries(dist)
                .filter(([, c]) => c > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, MAX_FACET_VALUES);
              if (entries.length === 0) return null;
              const active = new Set((filters.categories ?? []).map((v) => v.toLowerCase()));
              return (
                <div key={group.facet} className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">
                    {t(`search.filter.${group.facet}`, group.label)}
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {entries.map(([value, count]) => (
                      <Badge
                        key={value}
                        variant={active.has(value.toLowerCase()) ? 'default' : 'secondary'}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleCategory(value, group.facet)}
                      >
                        {value}
                        <span className="ml-1 opacity-60">{count}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}

          {!clustersLoading && clusters.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="inline-flex items-center gap-1.5 text-sm font-medium">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                {t('search.filter.topics', 'Topics')}
              </Label>
              <div className="flex flex-wrap gap-1">
                {clusters.map((cluster) => (
                  <Badge
                    key={cluster.id}
                    variant={filters.cluster_ids?.includes(cluster.id) ? 'default' : 'secondary'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleCluster(cluster.id)}
                    title={cluster.description ?? undefined}
                  >
                    {cluster.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Featured */}
      {show('featured') && (
        <div className="flex items-center gap-2">
          <Switch
            id="featured-only"
            checked={filters.featured || false}
            onCheckedChange={(checked) =>
              onFiltersChange({ ...filters, featured: checked || undefined })
            }
          />
          <Label htmlFor="featured-only" className="text-sm">
            {t('search.filter.featuredOnly', 'Featured only')}
          </Label>
        </div>
      )}

      {hasAny && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-xs text-destructive"
          onClick={() => (onClearAll ? onClearAll() : onFiltersChange({}))}
        >
          {t('search.clearAll', 'Clear all')}
        </Button>
      )}
    </div>
  );
};
