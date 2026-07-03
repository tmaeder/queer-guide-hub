import { describe, it, expect } from 'vitest';
import { generateRandomConfig } from '../avatarConfig';

describe('generateRandomConfig', () => {
  it('returns a complete config', () => {
    const c = generateRandomConfig();
    expect(c).toBeDefined();
    expect(c.circleColor).toBe('blue');
    expect(typeof c.lashes).toBe('boolean');
    expect(typeof c.mask).toBe('boolean');
    expect(c.skinTone).toBeTruthy();
  });
});
