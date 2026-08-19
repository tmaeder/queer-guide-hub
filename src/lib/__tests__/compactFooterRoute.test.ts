import { describe, expect, it } from 'vitest';
import { isCompactFooterRoute } from '../locale';

describe('isCompactFooterRoute', () => {
  it('takes the compact footer on single-purpose flows and account screens', () => {
    for (const path of [
      '/auth',
      '/auth/callback',
      '/claim-username',
      '/onboarding/welcome',
      '/hub',
      '/hub/messages',
      '/settings',
    ]) {
      expect(isCompactFooterRoute(path), path).toBe(true);
    }
  });

  it('leaves the full footer on public content', () => {
    for (const path of ['/', '/events', '/cities/berlin', '/help', '/guides', '/people']) {
      expect(isCompactFooterRoute(path), path).toBe(false);
    }
  });

  it('matches through the locale prefix', () => {
    expect(isCompactFooterRoute('/de/hub/plans')).toBe(true);
    expect(isCompactFooterRoute('/de/events')).toBe(false);
  });

  it('does not match a route that merely starts with the same letters', () => {
    // The exact-or-slash test is the whole reason the roots are not a bare
    // `startsWith`: a future /settings-export is a content page, not an
    // account screen.
    expect(isCompactFooterRoute('/settings-export')).toBe(false);
    expect(isCompactFooterRoute('/hubbub')).toBe(false);
    expect(isCompactFooterRoute('/authors')).toBe(false);
  });

  it('ignores a trailing slash', () => {
    expect(isCompactFooterRoute('/hub/')).toBe(true);
    expect(isCompactFooterRoute('/')).toBe(false);
  });
});
