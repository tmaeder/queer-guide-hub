/**
 * ContentListFilters — filter UI for ContentListPanel.
 * Renders per-field filter inputs (select / boolean / date range / number range / text)
 * and a "Clear filters" button when any filter is active.
 */

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldConfig, SelectOption } from '@/types/cms';
import type { DateRange, FilterState, FilterValue, NumberRange } from './types';

export interface ContentListFiltersProps {
  filterFields: FieldConfig[];
  filters: FilterState;
  dynamicOptions: Record<string, SelectOption[]>;
  setFilter: (name: string, value: FilterValue) => void;
  clearFilters: () => void;
}

const SENTINEL_ALL = '__all__';

export function ContentListFilters({
  filterFields,
  filters,
  dynamicOptions,
  setFilter,
  clearFilters,
}: ContentListFiltersProps) {
  if (filterFields.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 mb-4">
      {filterFields.map((f) => {
        const val = filters[f.name];
        if (f.type === 'select') {
          const effectiveOptions = f.dynamicOptions
            ? (dynamicOptions[f.name] ?? [])
            : (f.options ?? []);
          const current = (val as string) ?? '';
          return (
            <Select
              key={f.name}
              value={current === '' ? SENTINEL_ALL : current}
              onValueChange={(v) => setFilter(f.name, v === SENTINEL_ALL ? undefined : v)}
            >
              <SelectTrigger className="min-w-[140px] text-sm">
                <SelectValue placeholder={`All ${f.label}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINEL_ALL}>
                  <em>All {f.label}</em>
                </SelectItem>
                {effectiveOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        if (f.type === 'boolean') {
          const sv = val === undefined ? SENTINEL_ALL : val ? 'true' : 'false';
          return (
            <Select
              key={f.name}
              value={sv}
              onValueChange={(v) => {
                setFilter(f.name, v === SENTINEL_ALL ? undefined : v === 'true');
              }}
            >
              <SelectTrigger className="min-w-[130px] text-sm">
                <SelectValue placeholder={`Any ${f.label}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINEL_ALL}>
                  <em>Any {f.label}</em>
                </SelectItem>
                <SelectItem value="true">{f.label}</SelectItem>
                <SelectItem value="false">Not {f.label}</SelectItem>
              </SelectContent>
            </Select>
          );
        }
        if (f.type === 'datetime' || f.type === 'date') {
          const range = (val as DateRange | undefined) ?? {};
          return (
            <div key={f.name} className="flex items-center gap-1.5">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${f.name}-from`} className="text-xs">
                  {f.label} from
                </Label>
                <Input
                  id={`${f.name}-from`}
                  type="date"
                  value={range.from?.slice(0, 10) ?? ''}
                  onChange={(e) =>
                    setFilter(f.name, {
                      ...range,
                      from: e.target.value ? `${e.target.value}T00:00:00Z` : undefined,
                    })
                  }
                  className="w-40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${f.name}-to`} className="text-xs">
                  to
                </Label>
                <Input
                  id={`${f.name}-to`}
                  type="date"
                  value={range.to?.slice(0, 10) ?? ''}
                  onChange={(e) =>
                    setFilter(f.name, {
                      ...range,
                      to: e.target.value ? `${e.target.value}T23:59:59Z` : undefined,
                    })
                  }
                  className="w-32"
                />
              </div>
            </div>
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
          const step = f.max !== undefined && f.max <= 1 ? 0.05 : 1;
          return (
            <div key={f.name} className="flex items-center gap-1.5">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${f.name}-min`} className="text-xs">
                  {f.label} ≥
                </Label>
                <Input
                  id={`${f.name}-min`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={step}
                  value={range.min ?? ''}
                  onChange={(e) =>
                    updateRange({
                      ...range,
                      min: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${f.name}-max`} className="text-xs">
                  ≤
                </Label>
                <Input
                  id={`${f.name}-max`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={step}
                  value={range.max ?? ''}
                  onChange={(e) =>
                    updateRange({
                      ...range,
                      max: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className="w-24"
                />
              </div>
            </div>
          );
        }
        // text contains
        return (
          <Input
            key={f.name}
            placeholder={f.label}
            value={(val as string) ?? ''}
            onChange={(e) => setFilter(f.name, e.target.value || undefined)}
            className="w-44"
          />
        );
      })}
      {Object.keys(filters).length > 0 && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
          <X size={14} />
          Clear filters
        </Button>
      )}
    </div>
  );
}
