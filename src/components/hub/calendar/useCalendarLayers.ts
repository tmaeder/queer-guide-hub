import { useCallback, useState } from 'react';
import { CALENDAR_LAYERS } from './calendarLayers';
import type { CalendarLayerId } from './types';

const STORAGE_KEY = 'qg:hub:calendar:layers:v1';

function readStored(): Set<CalendarLayerId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const known = new Set(CALENDAR_LAYERS.map((l) => l.id));
        return new Set(parsed.filter((id): id is CalendarLayerId => known.has(id)));
      }
    }
  } catch {
    // fall through to defaults
  }
  return new Set(CALENDAR_LAYERS.filter((l) => l.defaultOn).map((l) => l.id));
}

/** Device-level layer visibility, persisted to localStorage. */
export function useCalendarLayers() {
  const [enabled, setEnabled] = useState<Set<CalendarLayerId>>(readStored);

  const toggle = useCallback((id: CalendarLayerId) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable (private mode) — state still works for the session
      }
      return next;
    });
  }, []);

  return { enabled, toggle };
}
