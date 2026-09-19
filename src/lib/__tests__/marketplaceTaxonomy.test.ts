import { describe, it, expect } from 'vitest';
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  DEPARTMENT_GROUPS,
  GROUP_LABELS,
  ADULT_DEPARTMENTS,
  groupLabel,
} from '@/lib/marketplaceTaxonomy';

describe('marketplace taxonomy mirror', () => {
  it('every ordered department has a label', () => {
    for (const dep of DEPARTMENT_ORDER) {
      expect(DEPARTMENT_LABELS[dep], `label for ${dep}`).toBeDefined();
    }
  });

  it('adult departments are known departments', () => {
    for (const dep of ADULT_DEPARTMENTS) {
      expect(DEPARTMENT_LABELS[dep], `adult dep ${dep}`).toBeDefined();
    }
  });

  it('every group in DEPARTMENT_GROUPS has a label', () => {
    for (const [dep, groups] of Object.entries(DEPARTMENT_GROUPS)) {
      expect(DEPARTMENT_LABELS[dep], `dep ${dep}`).toBeDefined();
      for (const g of groups) {
        expect(GROUP_LABELS[g], `label for group ${g} (dep ${dep})`).toBeDefined();
      }
    }
  });

  it('groupLabel falls back to a prettified slug for unknown groups', () => {
    expect(groupLabel('tops')).toBe('Tops');
    expect(groupLabel('some_new_group')).toBe('Some New Group');
    expect(groupLabel(null)).toBe('Other');
  });

  // ── Invariants the reverse map depends on ────────────────────────────────
  // `/marketplace/categories` turns DEPARTMENT_GROUPS inside out to build
  // `/marketplace/category/<department>?g=<group>` links. Both checks below are
  // pure and need no database; the direction a unit test CANNOT see (the SQL
  // classifier adding a group this mirror lacks) is handled at runtime instead,
  // by that page surfacing unroutable groups rather than dropping them.

  it('no group belongs to two departments — the reverse map must be unambiguous', () => {
    // A group claimed twice sends half its tiles to the wrong department page.
    // There is no visible symptom: the page renders, and only the count
    // disagrees with the tile the reader clicked.
    const seen = new Map<string, string>();
    for (const [dep, groups] of Object.entries(DEPARTMENT_GROUPS)) {
      for (const g of groups) {
        expect(seen.get(g), `group ${g} claimed by both ${seen.get(g)} and ${dep}`).toBeUndefined();
        seen.set(g, dep);
      }
    }
  });

  it('every labelled group is routed by some department', () => {
    // Catches the half-edit: a label added, the routing forgotten. Such a group
    // is invisible on the index page even though it reads as fully configured.
    // `apparel` was exactly this — a real SQL group missing from BOTH maps.
    const routed = new Set(Object.values(DEPARTMENT_GROUPS).flat());
    for (const g of Object.keys(GROUP_LABELS)) {
      expect(routed.has(g), `group ${g} has a label but no department routes it`).toBe(true);
    }
  });
});
