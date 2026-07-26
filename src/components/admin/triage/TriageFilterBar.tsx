import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { ReviewCounts } from '@/hooks/useReviewCounts';
import type { TriageFilters } from '@/hooks/useUnifiedTriageQueue';

const QUALITY_QUEUE_KEYS = [
  'quality-city',
  'quality-venue',
  'quality-village',
  'quality-personality',
  'quality-marketplace',
];

const QUEUE_CHIPS = [
  { key: 'staging', keys: ['staging'], label: 'Staging', countKey: 'staging' as const },
  { key: 'moderation', keys: ['moderation'], label: 'Reports', countKey: 'moderation' as const },
  { key: 'submissions', keys: ['submissions'], label: 'Submissions', countKey: 'submissions' as const },
  { key: 'content', keys: ['content'], label: 'CMS', countKey: 'cmsReview' as const },
  { key: 'automation', keys: ['automation'], label: 'Auto', countKey: 'automation' as const },
  { key: 'tags', keys: ['tags'], label: 'Tags', countKey: 'tagSuggestions' as const },
  { key: 'duplicates', keys: ['duplicates'], label: 'Dedup', countKey: 'duplicates' as const },
  { key: 'quality', keys: QUALITY_QUEUE_KEYS, label: 'Quality', countKey: 'quality' as const },
  { key: 'editorial', keys: ['editorial'], label: 'Editorial', countKey: 'editorial' as const },
] as const;

interface TriageFilterBarProps {
  filters: TriageFilters;
  counts: ReviewCounts | undefined;
  onFiltersChange: (f: Partial<TriageFilters>) => void;
}

export function TriageFilterBar({ filters, counts, onFiltersChange }: TriageFilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);

  function toggleQueue(keys: readonly string[]) {
    const current = filters.queueTypes ?? [];
    const allActive = keys.every((k) => current.includes(k));
    const next = allActive
      ? current.filter((k) => !keys.includes(k))
      : [...current, ...keys.filter((k) => !current.includes(k))];
    onFiltersChange({ queueTypes: next.length > 0 ? next : null, page: 1 });
  }

  function handleSearchSubmit() {
    onFiltersChange({ search: searchInput, page: 1 });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b">
      <div className="flex flex-wrap gap-1">
        {QUEUE_CHIPS.map((chip) => {
          const active = chip.keys.every((k) => filters.queueTypes?.includes(k) ?? false);
          const count = counts?.[chip.countKey] ?? 0;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => toggleQueue(chip.keys)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs border transition-colors ${
                active
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-foreground border-border hover:bg-muted'
              }`}
            >
              {chip.label}
              {count > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 min-w-4 px-1 text-2xs font-normal"
                >
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="relative w-48">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearchSubmit();
          }}
          placeholder="Search..."
          className="h-7 pl-8 text-xs"
        />
      </div>

      <Select
        value={filters.sort}
        onValueChange={(v) => onFiltersChange({ sort: v as TriageFilters['sort'] })}
      >
        <SelectTrigger className="h-7 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="priority">Priority</SelectItem>
          <SelectItem value="age">Oldest first</SelectItem>
          <SelectItem value="confidence">Low confidence</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
