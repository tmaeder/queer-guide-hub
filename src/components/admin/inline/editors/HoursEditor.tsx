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

type ScraperPeriod = { day: number; open: string; close: string };

/** "0900" → "09:00"; "09:00" → "09:00". Empty for unparseable. */
function normalizeTime(t: unknown): string {
  if (typeof t !== 'string') return '';
  const colonMatch = t.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
  const compactMatch = t.match(/^(\d{2})(\d{2})$/);
  if (compactMatch) return `${compactMatch[1]}:${compactMatch[2]}`;
  return '';
}

/** Read both shapes: legacy `{monday: {open, close}}` and scraper
 *  `{regular: [{day:1..7, open, close}, ...]}`. Prefer regular[] if present.
 *  Mon=1..Sun=7 (ISO); some scrapers use 0..6 with Sun=0 — handled. */
function fromInitial(value: unknown): HoursMap {
  const out: HoursMap = {};
  for (const { key } of DAYS) out[key] = { open: '', close: '' };
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;

  const regular = Array.isArray(v.regular) ? (v.regular as unknown[]) : null;
  if (regular && regular.length > 0) {
    for (const p of regular) {
      if (!p || typeof p !== 'object') continue;
      const period = p as Partial<ScraperPeriod>;
      if (typeof period.day !== 'number') continue;
      const idx = period.day >= 1 && period.day <= 7 ? period.day - 1 : (period.day + 6) % 7;
      const dayKey = DAYS[idx]?.key;
      if (!dayKey) continue;
      const open = normalizeTime(period.open);
      const close = normalizeTime(period.close);
      // First period wins; second period for the same day gets dropped
      // (the editor doesn't support split shifts — they'd be edited via the
      // side sheet's raw JSON view in a future phase).
      if (!out[dayKey].open && !out[dayKey].close) {
        out[dayKey] = { open, close };
      }
    }
    return out;
  }

  for (const { key } of DAYS) {
    const day = v[key];
    if (day && typeof day === 'object') {
      const obj = day as { open?: unknown; close?: unknown };
      out[key] = {
        open: normalizeTime(obj.open),
        close: normalizeTime(obj.close),
      };
    }
  }
  return out;
}

/** Strip empty days so we don't persist `{open:"", close:""}` rows.
 *  Preserves any non-day keys from the original value (e.g. `display`,
 *  `popular`, `open_now`, `regular`) so we don't blow away scraper
 *  metadata the admin didn't touch. */
function toPersisted(map: HoursMap, original: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const dayKeys = new Set(DAYS.map((d) => d.key));
  if (original && typeof original === 'object') {
    for (const [k, v] of Object.entries(original as Record<string, unknown>)) {
      // Strip the per-day keys (we rewrite them below) and `regular` (the
      // edited per-day map is now the source of truth).
      if (dayKeys.has(k) || k === 'regular') continue;
      out[k] = v;
    }
  }
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
    <div className="block p-4 border border-border rounded-element bg-background">
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
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">Leave both blank for closed · Esc to cancel</span>
        <EditorActions
          onConfirm={() => onSave(toPersisted(hours, initialValue))}
          onCancel={onCancel}
          saving={saving}
        />
      </div>
      <span className="sr-only">{field.label}</span>
    </div>
  );
}
