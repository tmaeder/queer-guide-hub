/**
 * Viewport math for the events timeline. Viewport is a half-open ms range
 * [startMs, endMs). All operations are pure.
 */
export interface Viewport {
  startMs: number;
  endMs: number;
}

const DAY = 86_400_000;
export const MIN_SPAN_MS = 1 * DAY;
export const MAX_SPAN_MS = 5 * 365 * DAY;

export function clampSpan(startMs: number, endMs: number): Viewport {
  const span = endMs - startMs;
  if (span < MIN_SPAN_MS) {
    const center = (startMs + endMs) / 2;
    return { startMs: center - MIN_SPAN_MS / 2, endMs: center + MIN_SPAN_MS / 2 };
  }
  if (span > MAX_SPAN_MS) {
    const center = (startMs + endMs) / 2;
    return { startMs: center - MAX_SPAN_MS / 2, endMs: center + MAX_SPAN_MS / 2 };
  }
  return { startMs, endMs };
}

export function panBy(v: Viewport, deltaMs: number): Viewport {
  return clampSpan(v.startMs + deltaMs, v.endMs + deltaMs);
}

/**
 * Zoom around an anchor (in viewport ms-space). factor > 1 zooms out, < 1 zooms in.
 */
export function zoomBy(v: Viewport, factor: number, anchorMs: number): Viewport {
  const newStart = anchorMs - (anchorMs - v.startMs) * factor;
  const newEnd = anchorMs + (v.endMs - anchorMs) * factor;
  return clampSpan(newStart, newEnd);
}

export function centerOn(v: Viewport, ms: number): Viewport {
  const half = (v.endMs - v.startMs) / 2;
  return clampSpan(ms - half, ms + half);
}

export function fitToData(starts: number[], ends: number[]): Viewport | null {
  if (starts.length === 0) return null;
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  if (max === min) {
    return clampSpan(min - DAY * 7, max + DAY * 7);
  }
  const pad = (max - min) * 0.05;
  return clampSpan(min - pad, max + pad);
}

export function defaultViewport(nowMs: number = Date.now()): Viewport {
  const start = nowMs - 7 * DAY;
  const end = nowMs + 60 * DAY;
  return { startMs: start, endMs: end };
}

export function pxForMs(v: Viewport, ms: number, trackWidth: number): number {
  return ((ms - v.startMs) / (v.endMs - v.startMs)) * trackWidth;
}

export function msForPx(v: Viewport, px: number, trackWidth: number): number {
  return v.startMs + (px / trackWidth) * (v.endMs - v.startMs);
}

export interface UnitStep {
  unit: 'day' | 'week' | 'month' | 'quarter';
  ms: number;
}

export function stepFor(v: Viewport): UnitStep {
  const span = v.endMs - v.startMs;
  if (span <= 14 * DAY) return { unit: 'day', ms: DAY };
  if (span <= 90 * DAY) return { unit: 'week', ms: 7 * DAY };
  if (span <= 730 * DAY) return { unit: 'month', ms: 30 * DAY };
  return { unit: 'quarter', ms: 91 * DAY };
}
