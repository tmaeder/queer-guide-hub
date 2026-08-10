import { describe, expect, it } from 'vitest';
import {
  SINGLE_MODULES,
  SINGLE_SPINE,
  SINGLE_TYPE_STACKS,
  modulesForType,
  moduleAllowed,
} from '../singleModules';
import { ROUTE_BULLET_MAP } from '@/components/transit/routeBulletMap';

describe('single-page content model', () => {
  it('carries the spec\'s 8 spine parts and 16 modules', () => {
    expect(SINGLE_SPINE).toHaveLength(8);
    expect(SINGLE_MODULES).toHaveLength(16);
    expect(SINGLE_MODULES.map((m) => m.n)).toEqual([...Array(16)].map((_, i) => i + 1));
  });

  it('declares all thirteen types', () => {
    expect(Object.keys(SINGLE_TYPE_STACKS)).toHaveLength(13);
  });

  it('never lists a module as both required and conditional', () => {
    for (const [type, s] of Object.entries(SINGLE_TYPE_STACKS)) {
      const overlap = s.required.filter((n) => s.conditional.includes(n));
      expect(overlap, `${type} lists ${overlap} twice`).toEqual([]);
    }
  });

  it('references only real module numbers', () => {
    const valid = new Set<number>(SINGLE_MODULES.map((m) => m.n));
    for (const [type, s] of Object.entries(SINGLE_TYPE_STACKS)) {
      for (const n of [...s.required, ...s.conditional]) {
        expect(valid.has(n), `${type} references module ${n}`).toBe(true);
      }
    }
  });

  it('returns modules in SPEC ORDER, not stack-declaration order', () => {
    // Rule 1: "Module order is fixed across types. A rider who learns one
    // single has learned all thirteen." The venue stack is declared
    // [1,2,4,3,...] — deliberately out of order in the spec — and must still
    // come back ascending.
    const ns = modulesForType('venue').map((x) => x.module.n);
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
    expect(ns).toContain(2);
  });

  it('marks required vs conditional correctly', () => {
    const venue = modulesForType('venue');
    expect(venue.find((x) => x.module.id === 'hours')?.required).toBe(true);
    expect(venue.find((x) => x.module.id === 'roster')?.required).toBe(false);
  });

  it('"never on this type" is enforceable, not advisory', () => {
    // A page must not add a module just because it happens to have data.
    expect(moduleAllowed('venue', 'variants')).toBe(false);
    expect(moduleAllowed('marketplace', 'variants')).toBe(true);
    expect(moduleAllowed('page', 'hours')).toBe(false);
  });

  it('every type has a route bullet, so cross-type links can be typed', () => {
    // Rule 4: "Cross-type links use the other type's bullet and color."
    // A type in the content model with no bullet cannot satisfy that.
    for (const type of Object.keys(SINGLE_TYPE_STACKS)) {
      expect(ROUTE_BULLET_MAP[type], `no bullet for ${type}`).toBeDefined();
    }
  });
});
