/**
 * ContentListFilters — filter UI for ContentListPanel.
 * Renders per-field filter inputs (select / boolean / date range / number range / text)
 * and a "Clear filters" button when any filter is active.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import { X } from 'lucide-react';
import type { FieldConfig, SelectOption } from '@/types/cms';
import type { DateRange, FilterState, FilterValue, NumberRange } from './types';

export interface ContentListFiltersProps {
  filterFields: FieldConfig[];
  filters: FilterState;
  dynamicOptions: Record<string, SelectOption[]>;
  setFilter: (name: string, value: FilterValue) => void;
  clearFilters: () => void;
}

export function ContentListFilters({
  filterFields,
  filters,
  dynamicOptions,
  setFilter,
  clearFilters,
}: ContentListFiltersProps) {
  if (filterFields.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.25,
        mb: 2,
      }}
    >
      {filterFields.map((f) => {
        const val = filters[f.name];
        if (f.type === 'select') {
          const effectiveOptions = f.dynamicOptions
            ? (dynamicOptions[f.name] ?? [])
            : (f.options ?? []);
          return (
            <Select
              key={f.name}
              size="small"
              displayEmpty
              value={(val as string) ?? ''}
              onChange={(e) => setFilter(f.name, e.target.value || undefined)}
              sx={{ minWidth: 140, fontSize: '0.85rem' }}
              renderValue={(v) =>
                v
                  ? (effectiveOptions.find((o) => o.value === v)?.label ?? String(v))
                  : `All ${f.label}`
              }
            >
              <MenuItem value="">
                <em>All {f.label}</em>
              </MenuItem>
              {effectiveOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          );
        }
        if (f.type === 'boolean') {
          const sv = val === undefined ? '' : val ? 'true' : 'false';
          return (
            <Select
              key={f.name}
              size="small"
              displayEmpty
              value={sv}
              onChange={(e) => {
                const v = e.target.value;
                setFilter(f.name, v === '' ? undefined : v === 'true');
              }}
              sx={{ minWidth: 130, fontSize: '0.85rem' }}
              renderValue={(v) =>
                v === 'true' ? f.label : v === 'false' ? `Not ${f.label}` : `Any ${f.label}`
              }
            >
              <MenuItem value="">
                <em>Any {f.label}</em>
              </MenuItem>
              <MenuItem value="true">{f.label}</MenuItem>
              <MenuItem value="false">Not {f.label}</MenuItem>
            </Select>
          );
        }
        if (f.type === 'datetime' || f.type === 'date') {
          const range = (val as DateRange | undefined) ?? {};
          return (
            <Box key={f.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TextField
                size="small"
                type="date"
                label={`${f.label} from`}
                InputLabelProps={{ shrink: true }}
                value={range.from?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setFilter(f.name, {
                    ...range,
                    from: e.target.value ? `${e.target.value}T00:00:00Z` : undefined,
                  })
                }
                sx={{ width: 160 }}
              />
              <TextField
                size="small"
                type="date"
                label="to"
                InputLabelProps={{ shrink: true }}
                value={range.to?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setFilter(f.name, {
                    ...range,
                    to: e.target.value ? `${e.target.value}T23:59:59Z` : undefined,
                  })
                }
                sx={{ width: 130 }}
              />
            </Box>
          );
        }
        if (f.type === 'number') {
          const range = (val as NumberRange | undefined) ?? {};
          const updateRange = (next: NumberRange) => {
            const clean: NumberRange = {};
            if (next.min !== undefined && !Number.isNaN(next.min)) clean.min = next.min;
            if (next.max !== undefined && !Number.isNaN(next.max)) clean.max = next.max;
            setFilter(
              f.name,
              clean.min === undefined && clean.max === undefined ? undefined : clean,
            );
          };
          return (
            <Box key={f.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <TextField
                size="small"
                type="number"
                label={`${f.label} ≥`}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  min: f.min,
                  max: f.max,
                  step: f.max !== undefined && f.max <= 1 ? 0.05 : 1,
                }}
                value={range.min ?? ''}
                onChange={(e) =>
                  updateRange({
                    ...range,
                    min: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                sx={{ width: 130 }}
              />
              <TextField
                size="small"
                type="number"
                label="≤"
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  min: f.min,
                  max: f.max,
                  step: f.max !== undefined && f.max <= 1 ? 0.05 : 1,
                }}
                value={range.max ?? ''}
                onChange={(e) =>
                  updateRange({
                    ...range,
                    max: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                sx={{ width: 100 }}
              />
            </Box>
          );
        }
        // text contains
        return (
          <TextField
            key={f.name}
            size="small"
            placeholder={f.label}
            value={(val as string) ?? ''}
            onChange={(e) => setFilter(f.name, e.target.value || undefined)}
            sx={{ width: 180 }}
          />
        );
      })}
      {Object.keys(filters).length > 0 && (
        <Button
          size="small"
          onClick={clearFilters}
          startIcon={<X size={14} />}
          sx={{ textTransform: 'none' }}
        >
          Clear filters
        </Button>
      )}
    </Box>
  );
}
