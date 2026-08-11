/**
 * Time presets for the map's "When" controls.
 *
 * Its own module so `MapControls` exports components and nothing else — a
 * mixed module breaks React Fast Refresh for the whole file
 * (`react-refresh/only-export-components`).
 */

export type PresetKey = 'tonight' | 'weekend' | 'month';

/** Concrete ISO range for a preset, resolved against now. */
export function presetRange(key: PresetKey): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (key === 'tonight') {
    end.setHours(23, 59, 59, 999);
  } else if (key === 'weekend') {
    // The coming Sat 00:00 → Sun 23:59. If today IS Sunday, "this weekend" is
    // the rest of today rather than six days away.
    const day = now.getDay();
    if (day === 0) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(now.getDate() + ((6 - day + 7) % 7));
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 1);
      end.setHours(23, 59, 59, 999);
    }
  } else {
    end.setMonth(now.getMonth() + 1);
    end.setHours(23, 59, 59, 999);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

/** True when `range` is exactly what `key` would produce right now. */
export function isPresetActive(
  key: PresetKey,
  range: { start: string; end: string } | undefined,
): boolean {
  if (!range) return false;
  const r = presetRange(key);
  return range.start === r.start && range.end === r.end;
}
