import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SearchFilters } from '@/hooks/useSearch';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';

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
      className="flex flex-wrap items-center"
      style={{ gap: 6, marginBottom: 16 }}
      role="region"
      aria-label={t('search.activeFilters', 'Active filters')}
    >
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="inline-flex items-center"
          style={{ gap: 4, fontSize: '0.75rem' }}
        >
          {chip.label}
          <button
            type="button"
            aria-label={t('search.removeFilter', 'Remove filter {{label}}', { label: chip.label })}
            onClick={chip.onRemove}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 0,
              padding: 0,
              marginLeft: 2,
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            <X style={{ height: 12, width: 12 }} />
          </button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        style={{ height: 24, fontSize: '0.75rem' }}
        onClick={() => onFiltersChange({})}
      >
        {t('search.clearAll', 'Clear all')}
      </Button>
    </div>
  );
}
