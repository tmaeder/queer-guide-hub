import { describe, it, expect } from 'vitest';
import { LEGACY_NEWS_TRIGGER_ENABLED } from '../featureFlags';

describe('featureFlags', () => {
  it('exports LEGACY_NEWS_TRIGGER_ENABLED as a boolean', () => {
    expect(typeof LEGACY_NEWS_TRIGGER_ENABLED).toBe('boolean');
  });

  it("is false when VITE_LEGACY_NEWS_TRIGGER is not 'true'/'1'/'yes'", () => {
    // VITE_LEGACY_NEWS_TRIGGER is unset in the test env → falsy result.
    expect(LEGACY_NEWS_TRIGGER_ENABLED).toBe(false);
  });
});
