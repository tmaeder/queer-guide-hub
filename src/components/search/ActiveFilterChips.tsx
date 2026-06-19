import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SearchFilters } from '@/hooks/useSearch';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';
import { formatNewsTag } from '@/lib/newsTags';

interface ActiveFilterChipsProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

type Chip = { key: string; label: string; onRemove: () => void };

function formatDate(d?: Date) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return '';
  }
}

export function ActiveFilterChips({ filters, onFiltersChange }: ActiveFilterChipsProps) {
  const { t } = useTranslation();
  const chips: Chip[] = [];

  (filters.types ?? []).forEach((t) => {
    const label = CONTENT_TYPES.find((c) => c.id === t)?.label ?? t;
    chips.push({
      key: `type:${t}`,
      label,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          types: (filters.types ?? []).filter((x) => x !== t),
        }),
    });
  });

  if (filters.location) {
    chips.push({
      key: 'location',
      label: filters.location,
      onRemove: () => onFiltersChange({ ...filters, location: undefined }),
    });
  }

  (filters.categories ?? []).forEach((c) => {
    chips.push({
      key: `cat:${c}`,
      label: c,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          categories: (filters.categories ?? []).filter((x) => x !== c),
        }),
    });
  });

  (filters.target_groups ?? []).forEach((g) => {
    chips.push({
      key: `tg:${g}`,
      label: g.replace(/_/g, ' '),
      onRemove: () =>
        onFiltersChange({
          ...filters,
          target_groups: (filters.target_groups ?? []).filter((x) => x !== g),
        }),
    });
  });

  (filters.tags ?? []).forEach((tag) => {
    chips.push({
      key: `tag:${tag}`,
      label: formatNewsTag(tag),
      onRemove: () =>
        onFiltersChange({
          ...filters,
          tags: (filters.tags ?? []).filter((x) => x !== tag),
        }),
    });
  });

  if (filters.free) {
    chips.push({
      key: 'free',
      label: t('search.filter.freeOnly', 'Free only'),
      onRemove: () => onFiltersChange({ ...filters, free: undefined }),
    });
  }

  if (filters.priceRange) {
    chips.push({
      key: 'price',
      label: `$${filters.priceRange[0]}–$${filters.priceRange[1]}`,
      onRemove: () => onFiltersChange({ ...filters, priceRange: undefined }),
    });
  }

  if (filters.dateRange) {
    chips.push({
      key: 'date',
      label: `${formatDate(filters.dateRange[0])} – ${formatDate(filters.dateRange[1])}`,
      onRemove: () => onFiltersChange({ ...filters, dateRange: undefined }),
    });
  }

  if (filters.rating) {
    chips.push({
      key: 'rating',
      label: `${filters.rating}★+`,
      onRemove: () => onFiltersChange({ ...filters, rating: undefined }),
    });
  }

  if (filters.featured) {
    chips.push({
      key: 'featured',
      label: 'Featured',
      onRemove: () => onFiltersChange({ ...filters, featured: undefined }),
    });
  }

  if (filters.verified) {
    chips.push({
      key: 'verified',
      label: 'Verified',
      onRemove: () => onFiltersChange({ ...filters, verified: undefined }),
    });
  }

  if (filters.lat !== undefined && filters.lng !== undefined) {
    const km = filters.radius ? Math.round(filters.radius / 1000) : 25;
    chips.push({
      key: 'near',
      label: t('search.nearMeWithRadius', 'Near me ({{km}}km)', { km }),
      onRemove: () =>
        onFiltersChange({ ...filters, lat: undefined, lng: undefined, radius: undefined }),
    });
  }

  (filters.cluster_ids ?? []).forEach((id) => {
    chips.push({
      key: `cluster:${id}`,
      label: 'Topic',
      onRemove: () =>
        onFiltersChange({
          ...filters,
          cluster_ids: (filters.cluster_ids ?? []).filter((x) => x !== id),
        }),
    });
  });

  if (chips.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 mb-4"
      role="region"
      aria-label={t('search.activeFilters', 'Active filters')}
    >
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="inline-flex items-center gap-1 text-xs"
        >
          {chip.label}
          <button
            type="button"
            aria-label={t('search.removeFilter', 'Remove filter {{label}}', { label: chip.label })}
            onClick={chip.onRemove}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 0,
              color: 'inherit',
            }}
            className="inline-flex p-0 ml-0.5 cursor-pointer"
          >
            <X size={12} />
          </button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        style={{ height: 24 }}
        className="text-xs"
        onClick={() => onFiltersChange({})}
      >
        {t('search.clearAll', 'Clear all')}
      </Button>
    </div>
  );
}
