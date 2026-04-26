/**
 * RecurrencePicker — UI for configuring event recurrence rules.
 *
 * Used in event creation/edit forms. Produces a recurrence_rule JSONB object:
 * { freq, interval, byDay, until, exceptions }
 */

import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Repeat } from 'lucide-react';

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  interval: number;
  byDay?: number[]; // 0=Sun ... 6=Sat
  until?: string;    // ISO date
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
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    updateField('byDay', next);
  };

  return (
    <Box sx={{ p: 2 }}>
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(_, checked) => handleToggle(checked)}
            size="small"
          />
        }
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Repeat size={16} />
            <Typography variant="body2" fontWeight={600}>
              Recurring event
            </Typography>
          </Box>
        }
      />

      {enabled && value && (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Frequency */}
          <TextField
            select
            label="Repeats"
            size="small"
            value={value.freq}
            onChange={(e) => updateField('freq', e.target.value as RecurrenceRule['freq'])}
          >
            {FREQ_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Day selection (for weekly/biweekly) */}
          {(value.freq === 'weekly' || value.freq === 'biweekly') && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                On days
              </Typography>
              <ToggleButtonGroup size="small" sx={{ flexWrap: 'wrap' }}>
                {DAY_LABELS.map((label, idx) => (
                  <ToggleButton
                    key={idx}
                    value={idx}
                    selected={value.byDay?.includes(idx)}
                    onClick={() => toggleDay(idx)}
                    sx={{
                      px: 1.5,
                      py: 0.5,
                      fontSize: '0.75rem',
                      textTransform: 'none',
                    }}
                  >
                    {label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )}

          {/* End date */}
          <TextField
            type="date"
            label="Ends on (optional)"
            size="small"
            value={value.until?.slice(0, 10) ?? ''}
            onChange={(e) =>
              updateField('until', e.target.value ? new Date(e.target.value).toISOString() : undefined)
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      )}
    </Box>
  );
};

/**
 * Human-readable summary of a recurrence rule.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function describeRecurrence(rule: RecurrenceRule | null | undefined): string | null {
  if (!rule) return null;
  const freq = rule.freq === 'biweekly' ? 'Every 2 weeks' : `${rule.freq.charAt(0).toUpperCase()}${rule.freq.slice(1)}`;
  const days = rule.byDay?.map((d) => DAY_LABELS[d]).join(', ');
  const until = rule.until ? ` until ${new Date(rule.until).toLocaleDateString()}` : '';
  return `${freq}${days ? ` on ${days}` : ''}${until}`;
}

export default RecurrencePicker;
