import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { listWhereNotNull } from '@/hooks/usePageFetchers';
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
      <div className="flex items-center gap-2">
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked || undefined)}
        />
        <Label style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{config.label}</Label>
      </div>
    );
  }

  if (config.type === 'select') {
    return <SelectFilter config={config} value={value as string | undefined} onChange={onChange} />;
  }

  if (config.type === 'multiselect') {
    return (
      <MultiSelectFilter
        config={config}
        value={(value as string[] | undefined) || []}
        onChange={onChange}
      />
    );
  }

  if (config.type === 'date-range') {
    return (
      <DateRangeFilter
        config={config}
        value={value as { from?: string; to?: string } | undefined}
        onChange={onChange}
      />
    );
  }

  return null;
}

interface SelectFilterProps {
  config: EntityFilterConfig;
  value: string | undefined;
  onChange: (value: unknown) => void;
}

function SelectFilter({ config, value, onChange }: SelectFilterProps) {
  const options = useFilterOptions(config);

  return (
    <div style={{ minWidth: 130 }}>
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
    </div>
  );
}

interface MultiSelectFilterProps {
  config: EntityFilterConfig;
  value: string[];
  onChange: (value: unknown) => void;
}

function MultiSelectFilter({ config, value, onChange }: MultiSelectFilterProps) {
  const options = useFilterOptions(config);
  const selected = new Set(value);

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    const arr = Array.from(next);
    onChange(arr.length === 0 ? undefined : arr);
  };

  const label =
    value.length === 0
      ? config.label
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label || value[0]
        : `${config.label} (${value.length})`;

  return (
    <div style={{ minWidth: 130 }}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            style={{ height: 36, fontSize: 13, justifyContent: 'space-between', width: '100%' }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            {value.length > 0 && (
              <X
                style={{ height: 14, width: 14, marginLeft: 4 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: 220, padding: 8, maxHeight: 320, overflow: 'auto' }}>
          <div className="flex flex-col gap-1">
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => toggle(opt.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(opt.value);
                  }
                }}
                role="option"
                tabIndex={0}
                aria-selected={selected.has(opt.value)}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-muted"
              >
                <Checkbox checked={selected.has(opt.value)} />
                <span style={{ fontSize: 13 }}>{opt.label}</span>
              </div>
            ))}
            {options.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--muted-foreground)', padding: 8 }}>
                No options
              </span>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface DateRangeFilterProps {
  config: EntityFilterConfig;
  value: { from?: string; to?: string } | undefined;
  onChange: (value: unknown) => void;
}

function DateRangeFilter({ config, value, onChange }: DateRangeFilterProps) {
  const from = value?.from ? new Date(value.from) : undefined;
  const to = value?.to ? new Date(value.to) : undefined;

  const update = (next: { from?: Date; to?: Date }) => {
    const out: { from?: string; to?: string } = {};
    if (next.from) out.from = next.from.toISOString();
    if (next.to) {
      const end = new Date(next.to);
      end.setHours(23, 59, 59, 999);
      out.to = end.toISOString();
    }
    onChange(out.from || out.to ? out : undefined);
  };

  const label =
    from && to
      ? `${format(from, 'MMM d')} – ${format(to, 'MMM d')}`
      : from
        ? `From ${format(from, 'MMM d, yyyy')}`
        : to
          ? `Until ${format(to, 'MMM d, yyyy')}`
          : config.label;

  return (
    <div style={{ minWidth: 160 }}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            style={{ height: 36, fontSize: 13, justifyContent: 'flex-start', width: '100%' }}
          >
            <CalendarIcon style={{ height: 14, width: 14, marginRight: 6 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            {(from || to) && (
              <X
                style={{ height: 14, width: 14, marginLeft: 'auto' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: 'auto', padding: 8 }}>
          <div className="flex flex-col gap-2">
            <div className="flex gap-4">
              <div>
                <Label style={{ fontSize: 12 }}>From</Label>
                <Calendar
                  mode="single"
                  selected={from}
                  onSelect={(d) => update({ from: d, to })}
                  initialFocus
                />
              </div>
              <div>
                <Label style={{ fontSize: 12 }}>To</Label>
                <Calendar
                  mode="single"
                  selected={to}
                  onSelect={(d) => update({ from, to: d })}
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function useFilterOptions(config: EntityFilterConfig): { value: string; label: string }[] {
  const isDynamic = config.options === 'dynamic';
  const [dynamicOptions, setDynamicOptions] = useState<{ value: string; label: string }[]>([]);

  const { data } = useQuery({
    queryKey: ['admin-filter-options', config.dynamicSource?.table, config.dynamicSource?.column],
    queryFn: async () => {
      if (!config.dynamicSource) return [];
      const { table, column, labelColumn } = config.dynamicSource;
      const selectCols = labelColumn ? `${column}, ${labelColumn}` : column;
      const data = await listWhereNotNull<Record<string, string>>(
        table,
        selectCols,
        column,
        labelColumn || column,
      );

      const seen = new Set<string>();
      const options: { value: string; label: string }[] = [];
      for (const row of data) {
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
    staleTime: 300_000,
  });

  useEffect(() => {
    if (data) setDynamicOptions(data);
  }, [data]);

  return isDynamic
    ? dynamicOptions
    : (config.options as { value: string; label: string }[]) || [];
}
