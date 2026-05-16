import { describe, it, expect } from 'vitest';
import * as Effects from '../index';

describe('effects barrel', () => {
  it('exports modules', () => {
    expect(Object.keys(Effects).length).toBeGreaterThan(0);
  });
});
