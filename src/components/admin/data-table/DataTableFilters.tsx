import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import type { EntityFilterConfig } from './types';

interface DataTableFiltersProps {
  filters: EntityFilterConfig[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function DataTableFilters({ filters, values, onChange }: DataTableFiltersProps) {
  return (
    <>
      {filters.map((filter) => (
        <FilterControl
          key={filter.key}
          config={filter}
          value={values[filter.column]}
          onChange={(v) => onChange(filter.column, v)}
        />
      ))}
    </>
  );
}

interface FilterControlProps {
  config: EntityFilterConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}

function FilterControl({ config, value, onChange }: FilterControlProps) {
  if (config.type === 'boolean') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked || undefined)}
        />
        <Label style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{config.label}</Label>
      </Box>
    );
  }

  if (config.type === 'select') {
    return <SelectFilter config={config} value={value as string | undefined} onChange={onChange} />;
  }

  return null;
}

interface SelectFilterProps {
  config: EntityFilterConfig;
  value: string | undefined;
  onChange: (value: unknown) => void;
}

function SelectFilter({ config, value, onChange }: SelectFilterProps) {
  const isDynamic = config.options === 'dynamic';
  const [dynamicOptions, setDynamicOptions] = useState<{ value: string; label: string }[]>([]);

  const { data } = useQuery({
    queryKey: ['admin-filter-options', config.dynamicSource?.table, config.dynamicSource?.column],
    queryFn: async () => {
      if (!config.dynamicSource) return [];
      const { table, column, labelColumn } = config.dynamicSource;
      const selectCols = labelColumn ? `${column}, ${labelColumn}` : column;
      const { data, error } = await supabase
        .from(table as 'venues')
        .select(selectCols)
        .not(column, 'is', null)
        .order(labelColumn || column);
      if (error) throw error;

      const seen = new Set<string>();
      const options: { value: string; label: string }[] = [];
      for (const row of data || []) {
        const val = (row as unknown as Record<string, string>)[column];
        if (val && !seen.has(val)) {
          seen.add(val);
          options.push({
            value: val,
            label: labelColumn ? (row as unknown as Record<string, string>)[labelColumn] || val : val,
          });
        }
      }
      return options;
    },
    enabled: isDynamic && !!config.dynamicSource,
    staleTime: 300_000, // 5 min cache for filter options
  });

  useEffect(() => {
    if (data) setDynamicOptions(data);
  }, [data]);

  const options = isDynamic
    ? dynamicOptions
    : (config.options as { value: string; label: string }[]) || [];

  return (
    <Box sx={{ minWidth: 130 }}>
      <Select
        value={(value as string) || 'all'}
        onValueChange={(v) => onChange(v === 'all' ? undefined : v)}
      >
        <SelectTrigger style={{ height: 36, fontSize: 13 }}>
          <SelectValue placeholder={config.label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All {config.label}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Box>
  );
}
