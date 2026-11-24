import { useCallback, useEffect, useState } from 'react';
import { getPresetDateRange } from '@/components/events/PresetChips';

/**
 * "When" for /going-out and the homepage: a preset or one calendar day.
 * `null` means the visitor has not chosen, and each surface keeps its own
 * default (the fallback ladder on /going-out, "next upcoming" on the board).
 *
 * Shared through sessionStorage, the same way and for the same reasons as the
 * region override (see `readOverride` in `@/hooks/regionOverride`): it survives
 * a reload, it never lands in a shared homepage URL, and it expires.
 */
export type WhenPreset = 'tonight' | 'this-weekend' | 'next-7-days';
export type When = WhenPreset | { day: string };

export const WHEN_PRESETS: readonly WhenPreset[] = ['tonight', 'this-weekend', 'next-7-days'];

const URL_FORM: Record<WhenPreset, string> = {
  tonight: 'tonight',
  'this-weekend': 'weekend',
  'next-7-days': '7d',
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseWhen(raw: string | null | undefined): When | null {
  if (!raw) return null;
  const preset = WHEN_PRESETS.find((p) => URL_FORM[p] === raw || p === raw);
  if (preset) return preset;
  if (DAY_RE.test(raw) && !Number.isNaN(new Date(`${raw}T00:00:00`).getTime())) return { day: raw };
  return null;
}

export function serializeWhen(when: When | null): string | null {
  if (!when) return null;
  return typeof when === 'string' ? URL_FORM[when] : when.day;
}

export function sameWhen(a: When | null, b: When | null): boolean {
  return serializeWhen(a) === serializeWhen(b);
}

/** Local `YYYY-MM-DD` for a Date (the calendar works in local days). */
export function toDayString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The time window a selection stands for. A day runs 00:00 to 06:00 the next
 * morning, because a night out that starts on Friday ends on Saturday. Presets
 * never start in the past: "this weekend" on a Saturday starts now.
 */
export function whenRange(when: When, now = new Date()): { start: Date; end: Date } {
  if (typeof when !== 'string') {
    const start = new Date(`${when.day}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(6, 0, 0, 0);
    return { start: start < now ? now : start, end };
  }
  const r = getPresetDateRange(when)!;
  return { start: r.start < now ? now : r.start, end: r.end };
}

export const WHEN_STORAGE_KEY = 'qg_home_when';
export const WHEN_EVENT = 'qg-home-when-changed';
const TTL_MS = 12 * 60 * 60 * 1000;

export function readWhen(): When | null {
  try {
    const raw = sessionStorage.getItem(WHEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: string; ts?: number };
    if (typeof parsed.ts !== 'number' || Date.now() - parsed.ts > TTL_MS) {
      sessionStorage.removeItem(WHEN_STORAGE_KEY);
      return null;
    }
    const when = parseWhen(parsed.v);
    // A picked day that has passed is no longer a choice anyone made.
    if (when && typeof when !== 'string' && when.day < toDayString(new Date())) return null;
    return when;
  } catch {
    return null;
  }
}

export function writeWhen(when: When | null) {
  try {
    const v = serializeWhen(when);
    if (!v) sessionStorage.removeItem(WHEN_STORAGE_KEY);
    else sessionStorage.setItem(WHEN_STORAGE_KEY, JSON.stringify({ v, ts: Date.now() }));
  } catch {
    /* private mode — the choice simply does not persist */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WHEN_EVENT));
}

/** The shared selection, kept in step across every mount in the tab. */
export function useWhen(): [When | null, (next: When | null) => void] {
  const [when, setState] = useState<When | null>(() =>
    typeof window === 'undefined' ? null : readWhen(),
  );
  useEffect(() => {
    const sync = () => setState(readWhen());
    window.addEventListener(WHEN_EVENT, sync);
    return () => window.removeEventListener(WHEN_EVENT, sync);
  }, []);
  const set = useCallback((next: When | null) => {
    setState(next);
    writeWhen(next);
  }, []);
  return [when, set];
}
