import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPersistedState,
  persistState,
  relativeTime,
  extractStatus,
  getStatusColor,
  getStatusLabel,
  getStatusTint,
  tintOf,
} from '../types';

describe('ContentListPanel/types', () => {
  beforeEach(() => sessionStorage.clear());

  it('loadPersistedState returns null when key missing', () => {
    expect(loadPersistedState('missing')).toBeNull();
  });

  it('persistState then loadPersistedState round-trips', () => {
    const state = { sorts: [{ field: 'title', dir: 'asc' }], hiddenColumns: ['slug'] };
    persistState('k', state);
    expect(loadPersistedState('k')).toEqual(state);
  });

  it('relativeTime returns string', () => {
    expect(typeof relativeTime(new Date().toISOString())).toBe('string');
  });

  it('extractStatus returns string or undefined', () => {
    const r = extractStatus({ status: 'draft' }, 'venues');
    expect(typeof r === 'string' || r === undefined).toBe(true);
  });

  it('getStatusColor returns a color', () => {
    expect(typeof getStatusColor('published')).toBe('string');
    expect(typeof getStatusColor(undefined)).toBe('string');
  });

  it('getStatusLabel returns a label', () => {
    expect(typeof getStatusLabel('draft')).toBe('string');
  });
});

describe('status badge tint', () => {
  // Callers used to append the hex alpha `1A` to getStatusColor(). That worked
  // while the palette was hex, but these are hsl(var(--x)) now, and
  // `hsl(var(--x))1A` is invalid at computed-value time — verified in Chromium,
  // it computes to rgba(0, 0, 0, 0), so the tint silently vanished.
  it('composes alpha inside hsl() instead of concatenating it', () => {
    expect(getStatusTint('published')).toBe('hsl(var(--foreground) / 0.1)');
    expect(getStatusTint('cancelled')).toBe('hsl(var(--destructive) / 0.1)');
  });

  it('never emits a value with trailing characters after the closing paren', () => {
    // The nested var() has its own ')', so this anchors on the LAST one: the
    // defect was `hsl(var(--x))1A`, i.e. characters after the closing paren.
    for (const s of ['published', 'draft', 'review', 'archived', 'cancelled', 'weird']) {
      expect(getStatusTint(s)).toMatch(/^hsl\(.*\)$/);
      expect(getStatusColor(s)).toMatch(/^hsl\(.*\)$/);
    }
  });

  it('returns transparent for no status rather than a broken colour', () => {
    expect(getStatusTint(undefined)).toBe('transparent');
    expect(getStatusColor(undefined)).toBe('transparent');
  });

  it('keeps the reduced-opacity review colour', () => {
    expect(getStatusColor('review')).toBe('hsl(var(--foreground) / 0.55)');
  });

  it('tintOf strips an existing alpha instead of stacking one', () => {
    expect(tintOf('hsl(var(--foreground))')).toBe('hsl(var(--foreground) / 0.1)');
    expect(tintOf('hsl(var(--foreground) / 0.55)')).toBe('hsl(var(--foreground) / 0.1)');
    expect(tintOf(undefined)).toBe('transparent');
  });
});
