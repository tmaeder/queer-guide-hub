import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

const DAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
] as const;

type DayHours = { open: string; close: string };
type HoursMap = Record<string, DayHours>;

function fromInitial(value: unknown): HoursMap {
  const out: HoursMap = {};
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    for (const { key } of DAYS) {
      const day = v[key];
      if (day && typeof day === 'object') {
        const obj = day as { open?: unknown; close?: unknown };
        out[key] = {
          open: typeof obj.open === 'string' ? obj.open : '',
          close: typeof obj.close === 'string' ? obj.close : '',
        };
      } else if (typeof day === 'string') {
        out[key] = { open: day, close: '' };
      } else {
        out[key] = { open: '', close: '' };
      }
    }
  } else {
    for (const { key } of DAYS) out[key] = { open: '', close: '' };
  }
  return out;
}

/** Strip empty days so we don't persist `{open:"", close:""}` rows. */
function toPersisted(map: HoursMap): Record<string, DayHours> {
  const out: Record<string, DayHours> = {};
  for (const { key } of DAYS) {
    const d = map[key];
    if (d && (d.open || d.close)) out[key] = d;
  }
  return out;
}

export function HoursEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [hours, setHours] = useState<HoursMap>(() => fromInitial(initialValue));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const update = (day: string, side: 'open' | 'close', val: string) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [side]: val } }));
  };

  return (
    <div className="block p-3 border border-border rounded-element bg-background">
      <div className="flex flex-col gap-2">
        {DAYS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-sm font-medium w-12">{label}</span>
            <Input
              type="time"
              value={hours[key]?.open ?? ''}
              onChange={(e) => update(key, 'open', e.target.value)}
              disabled={saving}
              className="h-8 flex-1"
              aria-label={`${label} open`}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="time"
              value={hours[key]?.close ?? ''}
              onChange={(e) => update(key, 'close', e.target.value)}
              disabled={saving}
              className="h-8 flex-1"
              aria-label={`${label} close`}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-muted-foreground">Leave both blank for closed · Esc to cancel</span>
        <EditorActions
          onConfirm={() => onSave(toPersisted(hours))}
          onCancel={onCancel}
          saving={saving}
        />
      </div>
      <span className="sr-only">{field.label}</span>
    </div>
  );
}
