import { useState } from 'react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { Search, ArrowDownUp, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Trip } from '@/hooks/useTrips';

export type TripStatusFilter = 'all' | Trip['status'];
export type TripSortKey = 'recent' | 'start_date' | 'alphabetical';

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: TripStatusFilter;
  onStatusFilterChange: (value: TripStatusFilter) => void;
  sortKey: TripSortKey;
  onSortChange: (value: TripSortKey) => void;
  counts: Record<TripStatusFilter, number>;
}

const STATUSES: TripStatusFilter[] = [
  'all',
  'planning',
  'active',
  'completed',
  'archived',
];

const SORT_KEYS: TripSortKey[] = ['recent', 'start_date', 'alphabetical'];

export function TripsToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortKey,
  onSortChange,
  counts,
}: Props) {
  const { t } = useTranslation();
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { md: 'center' },
        gap: { xs: 1.5, md: 2 },
        mb: 3,
      }}
    >
      {/* Search */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'action.hover',
          borderRadius: 1.25,
          px: 1.5,
          height: 40,
          minWidth: { xs: '100%', md: 260 },
          flex: { md: '0 0 auto' },
          transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
          '&:focus-within': { bgcolor: 'action.selected' },
        }}
      >
        <Search
          style={{ width: 16, height: 16, opacity: 0.6, flexShrink: 0 }}
          aria-hidden="true"
        />
        <InputBase
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('trips.toolbar.searchPlaceholder')}
          inputProps={{ 'aria-label': t('trips.toolbar.searchAria') }}
          sx={{ flex: 1, fontSize: '0.875rem' }}
        />
      </Box>

      {/* Status filter (scrollable chip row on mobile) */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          size="small"
          onChange={(_, v) => {
            if (v) onStatusFilterChange(v);
          }}
          aria-label={t('trips.toolbar.statusAria')}
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem',
              px: 1.5,
              py: 0.75,
              border: 1,
              borderColor: 'divider',
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              '&.Mui-selected': {
                bgcolor: 'brand.main',
                color: 'brand.contrastText',
                borderColor: 'brand.main',
                '&:hover': { bgcolor: 'brand.dark' },
              },
            },
          }}
        >
          {STATUSES.map((status) => (
            <ToggleButton key={status} value={status} aria-label={status}>
              {t(`trips.toolbar.status.${status}`)}
              <Box
                component="span"
                sx={{
                  ml: 0.75,
                  fontSize: '0.6875rem',
                  opacity: 0.7,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {counts[status] ?? 0}
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Sort */}
      <Box sx={{ flexShrink: 0 }}>
        <IconButton
          size="small"
          onClick={(e) => setSortAnchor(e.currentTarget)}
          aria-label={t('trips.toolbar.sortAria')}
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 1.25,
            height: 40,
            width: 40,
          }}
        >
          <ArrowDownUp style={{ width: 16, height: 16 }} />
        </IconButton>
        <Menu
          anchorEl={sortAnchor}
          open={Boolean(sortAnchor)}
          onClose={() => setSortAnchor(null)}
        >
          {SORT_KEYS.map((key) => (
            <MenuItem
              key={key}
              selected={key === sortKey}
              onClick={() => {
                onSortChange(key);
                setSortAnchor(null);
              }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {key === sortKey && (
                  <Check style={{ width: 16, height: 16 }} />
                )}
              </ListItemIcon>
              <ListItemText>{t(`trips.toolbar.sort.${key}`)}</ListItemText>
            </MenuItem>
          ))}
        </Menu>
      </Box>
    </Box>
  );
}
