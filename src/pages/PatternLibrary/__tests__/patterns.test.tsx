/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import * as patterns from '../patterns';

describe('PatternLibrary/patterns barrel', () => {
  it('exports at least one symbol', () => {
    expect(Object.keys(patterns).length).toBeGreaterThan(0);
  });
});
