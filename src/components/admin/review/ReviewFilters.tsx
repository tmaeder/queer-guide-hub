/**
 * ReviewFilters — Shared filter bar for all Review Hub tabs.
 *
 * Provides consistent search, status, type, and date filtering.
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';

export interface ReviewFilterState {
  search: string;
  status: string;
  contentType: string;
}

interface ReviewFiltersProps {
  filters: ReviewFilterState;
  onFiltersChange: (filters: ReviewFilterState) => void;
  statusOptions: Array<{ value: string; label: string }>;
  contentTypeOptions?: Array<{ value: string; label: string }>;
}

const DEFAULT_CONTENT_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'venues', label: 'Venues' },
  { value: 'events', label: 'Events' },
  { value: 'news_articles', label: 'News' },
  { value: 'personalities', label: 'Personalities' },
  { value: 'marketplace_listings', label: 'Marketplace' },
];

export const ReviewFilters = ({
  filters,
  onFiltersChange,
  statusOptions,
  contentTypeOptions = DEFAULT_CONTENT_TYPES,
}) => {
  const update = <K extends keyof ReviewFilterState>(key: K, value: ReviewFilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex gap-2 flex-wrap mb-4">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={filters.search}
          onChange={(e) => update('search', e.target.value)}
          className="h-9 pl-8 pr-8"
        />
        {filters.search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update('search', '')}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
          >
            <X size={14} />
          </Button>
        )}
      </div>

      {/* Status filter */}
      <Select value={filters.status} onValueChange={(v) => update('status', v)}>
        <SelectTrigger className="min-w-[130px] h-9 w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Content type filter */}
      <Select value={filters.contentType} onValueChange={(v) => update('contentType', v)}>
        <SelectTrigger className="min-w-[130px] h-9 w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {contentTypeOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ReviewFilters;
