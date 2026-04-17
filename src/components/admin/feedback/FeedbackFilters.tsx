import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { Search, X } from 'lucide-react';
import { feedbackCategories } from '@/config/feedbackCategories';
import { kanbanColumns, priorities } from './constants';
import type { AdminProfile } from './types';
import type { FeedbackUrlState } from '@/hooks/useFeedbackUrlState';

interface Props {
  state: FeedbackUrlState;
  update: (patch: Partial<FeedbackUrlState>) => void;
  clearFilters: () => void;
  activeFilterCount: number;
  admins: AdminProfile[];
  labels: string[];
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

export function FeedbackFilters({
  state,
  update,
  clearFilters,
  activeFilterCount,
  admins,
  labels,
  searchInputRef,
}: Props) {
  // Local debounced search — 300ms so URL + query don't fire per keystroke.
  const [localQ, setLocalQ] = useState(state.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if URL state changes externally (back/forward nav).
  useEffect(() => {
    setLocalQ(state.q);
  }, [state.q]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (localQ === state.q) return;
    debounceRef.current = setTimeout(() => update({ q: localQ }), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQ]);

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        flexWrap: 'wrap',
        alignItems: 'center',
        mb: 2,
      }}
    >
      <TextField
        inputRef={searchInputRef}
        size="small"
        placeholder="Search title, description, URL…"
        value={localQ}
        onChange={(e) => setLocalQ(e.target.value)}
        sx={{ minWidth: 260, flex: { xs: '1 1 100%', sm: '0 1 320px' } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={14} />
            </InputAdornment>
          ),
          endAdornment: localQ ? (
            <InputAdornment position="end">
              <Box
                component="button"
                onClick={() => setLocalQ('')}
                sx={{ p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer' }}
                aria-label="Clear search"
              >
                <X size={14} />
              </Box>
            </InputAdornment>
          ) : null,
        }}
      />

      <Select
        size="small"
        displayEmpty
        value={state.category ?? ''}
        onChange={(e) => update({ category: (e.target.value || null) as string | null })}
        sx={{ minWidth: 140 }}
      >
        <MenuItem value="">All categories</MenuItem>
        {feedbackCategories.map((c) => (
          <MenuItem key={c.value} value={c.value}>
            {c.label}
          </MenuItem>
        ))}
      </Select>

      <Select
        size="small"
        displayEmpty
        value={state.status ?? ''}
        onChange={(e) => update({ status: (e.target.value || null) as string | null })}
        sx={{ minWidth: 140 }}
      >
        <MenuItem value="">All statuses</MenuItem>
        {kanbanColumns.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.label}
          </MenuItem>
        ))}
      </Select>

      <Select
        size="small"
        displayEmpty
        value={state.priority ?? ''}
        onChange={(e) =>
          update({
            priority: e.target.value === '' ? null : Number(e.target.value),
          })
        }
        sx={{ minWidth: 120 }}
      >
        <MenuItem value="">All priorities</MenuItem>
        {priorities.map((p) => (
          <MenuItem key={p.value} value={p.value}>
            {p.short} · {p.label}
          </MenuItem>
        ))}
      </Select>

      <Select
        size="small"
        displayEmpty
        value={state.assignee ?? ''}
        onChange={(e) => update({ assignee: (e.target.value || null) as string | null })}
        sx={{ minWidth: 160 }}
      >
        <MenuItem value="">Any assignee</MenuItem>
        <MenuItem value="__unassigned__">Unassigned</MenuItem>
        {admins.map((a) => (
          <MenuItem key={a.user_id} value={a.user_id}>
            {a.display_name || a.user_id.slice(0, 8)}
          </MenuItem>
        ))}
      </Select>

      {labels.length > 0 && (
        <Select
          size="small"
          displayEmpty
          value={state.label ?? ''}
          onChange={(e) => update({ label: (e.target.value || null) as string | null })}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">Any label</MenuItem>
          {labels.map((l) => (
            <MenuItem key={l} value={l}>
              {l}
            </MenuItem>
          ))}
        </Select>
      )}

      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.hasScreenshot}
            onChange={(e) => update({ hasScreenshot: e.target.checked })}
          />
        }
        label="Has screenshot"
        sx={{ ml: 0.5, '& .MuiTypography-root': { fontSize: '0.75rem' } }}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.hasErrors}
            onChange={(e) => update({ hasErrors: e.target.checked })}
          />
        }
        label="Has errors"
        sx={{ ml: 0.5, '& .MuiTypography-root': { fontSize: '0.75rem' } }}
      />
      {state.tab === 'community' && (
        <>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={state.showSpam}
                onChange={(e) => update({ showSpam: e.target.checked })}
              />
            }
            label="Include spam"
            sx={{ ml: 0.5, '& .MuiTypography-root': { fontSize: '0.75rem' } }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={state.showDuplicates}
                onChange={(e) => update({ showDuplicates: e.target.checked })}
              />
            }
            label="Include dups"
            sx={{ ml: 0.5, '& .MuiTypography-root': { fontSize: '0.75rem' } }}
          />
        </>
      )}

      {activeFilterCount > 0 && (
        <Chip
          size="small"
          variant="outlined"
          onDelete={clearFilters}
          label={`${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}`}
        />
      )}
      <Button size="small" variant="text" onClick={clearFilters} disabled={activeFilterCount === 0}>
        Reset
      </Button>
    </Box>
  );
}
