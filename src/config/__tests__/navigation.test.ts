import { describe, it, expect } from 'vitest';
import {
  DESTINATIONS,
  PRIMARY_NAV,
  MORE_NAV,
  NAV_CLUSTERS,
  USER_MODES,
  USER_MODE_VALUES,
  MODE_SCOPE_BIAS,
} from '../navigation';

describe('navigation config', () => {
  it('has 14 destinations split into 5 primary + 9 secondary', () => {
    expect(DESTINATIONS).toHaveLength(14);
    expect(PRIMARY_NAV).toHaveLength(5);
    expect(MORE_NAV).toHaveLength(9);
    expect(PRIMARY_NAV.length + MORE_NAV.length).toBe(DESTINATIONS.length);
  });

  it('gives every destination a cluster that exists, and every cluster a member', () => {
    const clusterIds = NAV_CLUSTERS.map((c) => c.id);
    for (const d of DESTINATIONS) {
      expect(clusterIds).toContain(d.cluster);
    }
    for (const id of clusterIds) {
      expect(DESTINATIONS.some((d) => d.cluster === id)).toBe(true);
    }
  });

  it('has unique destination routes', () => {
    const routes = DESTINATIONS.map((d) => d.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('keeps modes and mode-scope bias in lockstep', () => {
    expect(USER_MODES).toHaveLength(6);
    expect(USER_MODE_VALUES).toHaveLength(6);
    expect(USER_MODES.map((m) => m.value).sort()).toEqual([...USER_MODE_VALUES].sort());
    for (const mode of USER_MODE_VALUES) {
      expect(MODE_SCOPE_BIAS[mode]).toBeDefined();
      expect(MODE_SCOPE_BIAS[mode].length).toBeGreaterThan(0);
    }
  });
});
