import { describe, it, expect } from 'vitest';
import * as DT from '../index';

describe('data-table barrel', () => {
  it('exports something', () => {
    expect(Object.keys(DT).length).toBeGreaterThan(0);
  });
});
