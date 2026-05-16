import { describe, it, expect } from 'vitest';
import { autoLayout } from '../autoLayout';

describe('autoLayout', () => {
  it('returns nodes array for empty input', () => {
    expect(autoLayout([], [])).toEqual([]);
  });
  it('returns positions for single node', () => {
    const out = autoLayout([{ id: 'a', position: { x: 0, y: 0 }, data: {} } as never], []);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(1);
  });
});
