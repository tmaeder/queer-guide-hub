import { describe, it, expect } from 'vitest';
import { PLATFORM_CONFIGS } from '../platformConfigs';

describe('PLATFORM_CONFIGS', () => {
  it('is non-empty array', () => {
    expect(Array.isArray(PLATFORM_CONFIGS)).toBe(true);
    expect(PLATFORM_CONFIGS.length).toBeGreaterThan(0);
  });
  it('each entry has required fields', () => {
    for (const c of PLATFORM_CONFIGS) {
      expect(typeof c.category).toBe('string');
      expect(typeof c.platform).toBe('string');
      expect(typeof c.urlDetectionRegex).toBe('string');
      expect(typeof c.idValidationRegex).toBe('string');
    }
  });
});
