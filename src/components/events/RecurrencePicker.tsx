/**
 * RecurrencePicker — UI for configuring event recurrence rules.
 *
 * Used in event creation/edit forms. Produces a recurrence_rule JSONB object:
 * { freq, interval, byDay, until, exceptions }
 */

import React, { useState, useCallback } from 'react';
import { Repeat } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  interval: number;
  byDay?: number[]; // 0=Sun ... 6=Sat
  until?: string; // ISO date
  exceptions?: string[];
}

interface RecurrencePickerProps {
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FREQ_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

export const RecurrencePicker: React.FC<RecurrencePickerProps> = ({ value, onChange }) => {
  const [enabled, setEnabled] = useState(!!value);

  const handleToggle = useCallback(
    (checked: boolean) => {
      setEnabled(checked);
      if (checked) {
        onChange({ freq: 'weekly', interval: 1, byDay: [] });
      } else {
        onChange(null);
      }
    },
    [onChange],
  );

  const updateField = <K extends keyof RecurrenceRule>(key: K, val: RecurrenceRule[K]) => {
    if (!value) return;
    onChange({ ...value, [key]: val });
  };

  const toggleDay = (day: number) => {
    if (!value) return;
    const current = value.byDay || [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    updateField('byDay', next);
  };

  return (
    <div className="p-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <Switch checked={enabled} onCheckedChange={handleToggle} />
        <span className="flex items-center gap-1">
          <Repeat size={16} />
          <span className="text-sm font-semibold">Recurring event</span>
        </span>
      </label>

      {enabled && value && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Frequency */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Repeats</Label>
            <Select
              value={value.freq}
              onValueChange={(v) => updateField('freq', v as RecurrenceRule['freq'])}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQ_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day selection (for weekly/biweekly) */}
          {(value.freq === 'weekly' || value.freq === 'biweekly') && (
            <div>
              <p className="text-xs text-muted-foreground mb-1 block">On days</p>
              <div className="flex flex-wrap gap-1">
                {DAY_LABELS.map((label, idx) => {
                  const selected = value.byDay?.includes(idx);
                  return (
                    <Button
                      key={idx}
                      type="button"
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDay(idx)}
                      className="px-3 py-1 h-8 text-xs normal-case"
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* End date */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Ends on (optional)</Label>
            <Input
              type="date"
              value={value.until?.slice(0, 10) ?? ''}
              onChange={(e) =>
                updateField(
                  'until',
                  e.target.value ? new Date(e.target.value).toISOString() : undefined,
                )
              }
              className="h-9"
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Human-readable summary of a recurrence rule.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function describeRecurrence(rule: RecurrenceRule | null | undefined): string | null {
  if (!rule) return null;
  const freq =
    rule.freq === 'biweekly'
      ? 'Every 2 weeks'
      : `${rule.freq.charAt(0).toUpperCase()}${rule.freq.slice(1)}`;
  const days = rule.byDay?.map((d) => DAY_LABELS[d]).join(', ');
  const until = rule.until ? ` until ${new Date(rule.until).toLocaleDateString()}` : '';
  return `${freq}${days ? ` on ${days}` : ''}${until}`;
}

export default RecurrencePicker;
