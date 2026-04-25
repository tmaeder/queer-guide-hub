import React, { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import InputAdornment from '@mui/material/InputAdornment';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { ExploreMapFilters as Filters } from '@/hooks/useExploreMapData';

interface ExploreMapFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export const ExploreMapFiltersPanel: React.FC<ExploreMapFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const [open, setOpen] = useState(false);
  const hasActiveFilters = !!(filters.search || filters.category || filters.tags?.length);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAll = () => {
    onFiltersChange({});
  };

  return (
    <Box sx={{ px: 1.5, pb: 1, pt: 1, bgcolor: 'rgba(var(--mui-palette-background-defaultChannel) / 0.92)', backdropFilter: 'blur(8px)' }}>
      {/* Compact bar: search + toggle */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search map…"
          value={filters.search ?? ''}
          onChange={(e) => updateFilter('search', e.target.value || undefined)}
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
                        <IconButton size="small" aria-label="Clear search" onClick={() => updateFilter('search', undefined)}>
                          <X size={14} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }
                : {}),
            },
          }}
          sx={{ flex: 1, '& .MuiInputBase-root': { height: 36, fontSize: '0.85rem' } }}
        />

        <IconButton
          size="small"
          aria-label={open ? 'Hide filters' : 'Show filters'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          sx={{
            width: 36,
            height: 36,
          }}
        >
          <SlidersHorizontal size={16} />
        </IconButton>
      </Box>

      {/* Expanded filters */}
      <Collapse in={open}>
        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            label="Category"
            value={filters.category ?? ''}
            onChange={(e) => updateFilter('category', e.target.value || undefined)}
            sx={{ minWidth: 140, '& .MuiInputBase-root': { height: 36, fontSize: '0.85rem' } }}
          />

          {hasActiveFilters && (
            <Button
              size="small"
              color="error"
              variant="text"
              startIcon={<X size={14} />}
              onClick={clearAll}
              sx={{ textTransform: 'none', fontSize: '0.8rem' }}
            >
              Clear all
            </Button>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

export default ExploreMapFiltersPanel;
