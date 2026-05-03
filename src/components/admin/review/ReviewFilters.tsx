/**
 * ReviewFilters — Shared filter bar for all Review Hub tabs.
 *
 * Provides consistent search, status, type, and date filtering.
 */

import React from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
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

export const ReviewFilters: React.FC<ReviewFiltersProps> = ({
  filters,
  onFiltersChange,
  statusOptions,
  contentTypeOptions = DEFAULT_CONTENT_TYPES,
}) => {
  const update = <K extends keyof ReviewFilterState>(key: K, value: ReviewFilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      {/* Search */}
      <TextField
        size="small"
        placeholder="Search..."
        value={filters.search}
        onChange={(e) => update('search', e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
            ...(filters.search
              ? {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => update('search', '')}>
                        <X size={14} />
                      </IconButton>
                    </InputAdornment>
                  ),
                }
              : {}),
          },
        }}
        sx={{ flex: 1, minWidth: 200, '& .MuiInputBase-root': { height: 36 } }}
      />

      {/* Status filter */}
      <TextField
        select
        size="small"
        value={filters.status}
        onChange={(e) => update('status', e.target.value)}
        sx={{ minWidth: 130, '& .MuiInputBase-root': { height: 36 } }}
      >
        {statusOptions.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {/* Content type filter */}
      <TextField
        select
        size="small"
        value={filters.contentType}
        onChange={(e) => update('contentType', e.target.value)}
        sx={{ minWidth: 130, '& .MuiInputBase-root': { height: 36 } }}
      >
        {contentTypeOptions.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
};

export default ReviewFilters;
