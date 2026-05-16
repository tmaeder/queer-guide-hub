import { describe, it, expect } from 'vitest';
import * as Patterns from '../index';

describe('patterns barrel', () => {
  it('exports something', () => {
    expect(Object.keys(Patterns).length).toBeGreaterThan(0);
  });
});
