import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeRegistry } from '@/config/contentTypes';

/**
 * Every `/admin/content/<id>` a route redirects to must exist in the registry.
 *
 * The eight controlled-vocabulary pages were replaced by redirects into the
 * registry. A typo in a target ("accessibility" vs "accessibility_attributes")
 * or a later registry rename produces a dead admin route that renders the
 * generic not-found shell — no build error, no test failure, and nobody
 * notices until an editor goes looking for a taxonomy they can no longer
 * reach. Parsing the route table is the only place that pairing is visible.
 */

const ROUTES = readFileSync(join(__dirname, '..', 'routes.tsx'), 'utf8');

/** `<Route path="settings/target-groups" element={<Navigate to="/admin/content/target_groups" ... />` */
const REDIRECT_RE =
  /<Route\s+path="([^"]+)"\s+element=\{<Navigate\s+to="\/admin\/content\/([a-z_]+)"/g;

function redirects(): Array<{ from: string; to: string }> {
  return [...ROUTES.matchAll(REDIRECT_RE)].map((m) => ({ from: m[1], to: m[2] }));
}

describe('admin content redirects', () => {
  it('finds the redirect table', () => {
    expect(redirects().length).toBeGreaterThanOrEqual(8);
  });

  it('every redirect target is a registered content type', () => {
    for (const { from, to } of redirects()) {
      expect(
        contentTypeRegistry[to],
        `/admin/${from} redirects to /admin/content/${to}, which is not in the registry`,
      ).toBeDefined();
    }
  });

  it('routes each retired vocabulary page to its registry type', () => {
    const map = Object.fromEntries(redirects().map((r) => [r.from, r.to]));
    expect(map['settings/venue-categories']).toBe('venue_categories');
    expect(map['settings/venue-services']).toBe('venue_services');
    expect(map['settings/event-types']).toBe('event_types');
    expect(map['settings/event-amenities']).toBe('event_amenities');
    expect(map['settings/event-services']).toBe('event_services');
    // The path says "accessibility"; the table is accessibility_attributes.
    expect(map['settings/accessibility']).toBe('accessibility_attributes');
    expect(map['settings/target-groups']).toBe('target_groups');
    expect(map['settings/professions']).toBe('professions');
  });

  it('no longer imports the deleted vocabulary pages', () => {
    for (const name of [
      'AdminVenueCategories',
      'AdminVenueServices',
      'AdminEventTypes',
      'AdminEventAmenities',
      'AdminEventServices',
      'AdminAccessibilityAttributes',
      'AdminTargetGroups',
      'AdminProfessions',
    ]) {
      expect(ROUTES.includes(name), `routes.tsx still references ${name}`).toBe(false);
    }
  });
});
