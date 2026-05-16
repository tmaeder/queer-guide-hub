import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPersistedState, persistState,
  relativeTime, extractStatus, getStatusColor, getStatusLabel,
} from '../types';

describe('ContentListPanel/types', () => {
  beforeEach(() => sessionStorage.clear());

  it('loadPersistedState returns null when key missing', () => {
    expect(loadPersistedState('missing')).toBeNull();
  });

  it('persistState then loadPersistedState round-trips', () => {
    persistState('k', { sortField: 'title', sortDir: 'desc' });
    expect(loadPersistedState('k')).toEqual({ sortField: 'title', sortDir: 'desc' });
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
