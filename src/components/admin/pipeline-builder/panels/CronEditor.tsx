import { useState, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

/**
 * Friendly cron expression editor with presets + raw mode.
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 */

const PRESETS = [
  { label: 'Every minute', cron: '* * * * *' },
  { label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { label: 'Every 10 minutes', cron: '*/10 * * * *' },
  { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { label: 'Every 30 minutes', cron: '*/30 * * * *' },
  { label: 'Hourly (top of hour)', cron: '0 * * * *' },
  { label: 'Every 3 hours', cron: '0 */3 * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Every 12 hours', cron: '0 */12 * * *' },
  { label: 'Daily at midnight UTC', cron: '0 0 * * *' },
  { label: 'Daily at 2am UTC', cron: '0 2 * * *' },
  { label: 'Daily at 6am UTC', cron: '0 6 * * *' },
  { label: 'Weekly (Sunday midnight)', cron: '0 0 * * 0' },
  { label: 'Weekly (Monday 8am)', cron: '0 8 * * 1' },
  { label: 'Monthly (1st, midnight)', cron: '0 0 1 * *' },
];

function describeCron(cron: string | null | undefined): string {
  if (!cron) return 'Manual (no schedule)';
  const preset = PRESETS.find(p => p.cron === cron);
  if (preset) return preset.label;

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return `Custom: ${cron}`;
  const [min, hour, dom, month, dow] = parts;

  if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') return 'Every minute';
  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') return `Every ${min.slice(2)} minutes`;
  if (hour.startsWith('*/') && min === '0' && dom === '*' && month === '*' && dow === '*') return `Every ${hour.slice(2)} hours`;
  if (dom === '*' && month === '*' && dow === '*' && /^\d+$/.test(min) && /^\d+$/.test(hour)) {
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
  }
  return `Custom: ${cron}`;
}

function validateCron(cron: string): { valid: boolean; error?: string } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return { valid: false, error: 'Cron must have 5 fields (minute hour dom month dow)' };
  const ranges = [
    [0, 59, 'minute'],
    [0, 23, 'hour'],
    [1, 31, 'day-of-month'],
    [1, 12, 'month'],
    [0, 7, 'day-of-week'],
  ] as const;
  for (let i = 0; i < 5; i++) {
    const p = parts[i];
    const [min, max, name] = ranges[i];
    if (p === '*') continue;
    if (p.startsWith('*/')) {
      const n = Number(p.slice(2));
      if (!Number.isFinite(n) || n < 1) return { valid: false, error: `Invalid ${name} step: ${p}` };
      continue;
    }
    for (const subExpr of p.split(',')) {
      for (const rangeExpr of subExpr.split('-')) {
        const n = Number(rangeExpr);
        if (!Number.isFinite(n) || n < min || n > max) {
          return { valid: false, error: `${name} out of range: ${rangeExpr} (expected ${min}-${max})` };
        }
      }
    }
  }
  return { valid: true };
}

interface CronEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function CronEditor({ value, onChange }: CronEditorProps) {
  const [mode, setMode] = useState<'preset' | 'raw'>(
    PRESETS.some(p => p.cron === value) ? 'preset' : (value ? 'raw' : 'preset')
  );
  const [rawValue, setRawValue] = useState(value || '');

  const validation = useMemo(() => {
    if (mode === 'raw' && rawValue) return validateCron(rawValue);
    return { valid: true };
  }, [mode, rawValue]);

  const description = useMemo(() => describeCron(value), [value]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex gap-1">
          <button
            onClick={() => setMode('preset')}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              mode === 'preset'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >Preset</button>
          <button
            onClick={() => setMode('raw')}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              mode === 'raw'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >Raw cron</button>
        </div>
      </div>

      {mode === 'preset' ? (
        <Select
          value={value || '__manual__'}
          onValueChange={(v) => {
            onChange(v === '__manual__' ? null : v);
            setRawValue(v === '__manual__' ? '' : v);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select schedule..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__manual__" className="text-xs italic text-muted-foreground">Manual (no schedule)</SelectItem>
            {PRESETS.map(p => (
              <SelectItem key={p.cron} value={p.cron} className="text-xs">
                <span>{p.label}</span>
                <span className="ml-2 text-muted-foreground font-mono">{p.cron}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <>
          <Input
            value={rawValue}
            onChange={(e) => {
              setRawValue(e.target.value);
              const v = validateCron(e.target.value);
              if (v.valid) onChange(e.target.value.trim() || null);
            }}
            placeholder="* * * * * (min hour dom month dow)"
            className="h-8 text-xs font-mono"
          />
          {!validation.valid && (
            <div className="text-[10px] text-destructive">{validation.error}</div>
          )}
        </>
      )}

      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
        <span className="opacity-60">→</span>
        <span>{description}</span>
      </div>
    </div>
  );
}

export { describeCron, validateCron };
