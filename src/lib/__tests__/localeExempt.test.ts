import { describe, it, expect } from 'vitest';
import { isLocaleExemptPath } from '../locale';

/**
 * These roots are mounted at the TOP LEVEL of routes.tsx, outside the
 * `/:locale?` parent. Prefixing one yields `/de/onboarding/welcome`, which
 * matches no route and renders NotFound — a silent 404 reachable only from a
 * non-English page.
 */
describe('isLocaleExemptPath', () => {
  it('exempts every top-level-mounted root', () => {
    for (const p of ['/admin', '/auth', '/onboarding', '/claim-username']) {
      expect(isLocaleExemptPath(p)).toBe(true);
      expect(isLocaleExemptPath(`${p}/child`)).toBe(true);
    }
  });

  it('exempts the specific routes this change depends on', () => {
    // Regression: both of these were prefixed before, so onboarding was
    // unreachable from any localized page.
    expect(isLocaleExemptPath('/onboarding/welcome')).toBe(true);
    expect(isLocaleExemptPath('/auth/reset-password')).toBe(true);
  });

  it('exempts external URLs', () => {
    expect(isLocaleExemptPath('https://example.com')).toBe(true);
  });

  it('does NOT exempt ordinary localized content routes', () => {
    for (const p of ['/travel', '/venues', '/city/berlin', '/news', '/']) {
      expect(isLocaleExemptPath(p)).toBe(false);
    }
  });

  it('does not match a longer name that merely shares a prefix', () => {
    // `/administrators` must stay localized even though it starts with /admin.
    expect(isLocaleExemptPath('/administrators')).toBe(false);
    expect(isLocaleExemptPath('/onboarding-guide')).toBe(false);
    expect(isLocaleExemptPath('/authors')).toBe(false);
  });
});
