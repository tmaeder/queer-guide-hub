/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { getRedirectColumns } from '../redirectColumns';

describe('getRedirectColumns', () => {
  it('returns an array of column defs', () => {
    const cols = getRedirectColumns();
    expect(Array.isArray(cols)).toBe(true);
    expect(cols.length).toBeGreaterThan(0);
  });
});
