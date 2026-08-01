import { describe, expect, it, vi } from 'vitest';
import { validateAgainstRegistry } from '@/lib/cms/zodFromFields';
import { redirectContentType } from '../redirect';

vi.mock('@/components/admin/redirects/RedirectEventsPanel', () => ({
  RedirectEventsPanel: () => null,
}));
vi.mock('@/components/admin/redirects/RedirectToolbarActions', () => ({
  RedirectToolbarActions: () => null,
}));

/**
 * Regression guard for a type mismatch that made every existing redirect
 * unsavable.
 *
 * `status_code` is an integer column. Declaring it as a `select` with string
 * options built a `z.enum(['301', …])`, so a row loaded from Postgres — where
 * the value is the NUMBER 301 — failed validation on open. The editor would
 * refuse to save and blame a field that looked perfectly fine.
 *
 * Whatever shape the field takes, these two must hold.
 */

const base = { type: 'SHORT', slug: 'promo', target: '/venues' };

describe('redirect status_code accepts what the database actually returns', () => {
  it('validates a row whose status_code is a number', () => {
    const result = validateAgainstRegistry(redirectContentType, { ...base, status_code: 301 });
    const offenders = result.ok ? [] : result.issues.map((i) => i.field);
    expect(offenders, 'a numeric status_code must not fail validation').not.toContain('status_code');
    expect(result.ok).toBe(true);
  });

  it.each([301, 302, 307, 308])('accepts %i', (code) => {
    const result = validateAgainstRegistry(redirectContentType, { ...base, status_code: code });
    expect(result.ok).toBe(true);
  });

  it('still validates the rest of the record', () => {
    // The guard must not have been bought by making everything permissive.
    const result = validateAgainstRegistry(redirectContentType, {
      type: 'SHORT',
      status_code: 301,
      // target missing — required
    });
    expect(result.ok).toBe(false);
  });
});
