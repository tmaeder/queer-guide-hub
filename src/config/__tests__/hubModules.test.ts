import { describe, it, expect } from 'vitest';
import { HUB_MODULES } from '../hubModules';

describe('hubModules registry', () => {
  it('has unique ids and paths', () => {
    const ids = HUB_MODULES.map((m) => m.id);
    const paths = HUB_MODULES.map((m) => m.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('exposes community, connection, and personal modules in one registry', () => {
    expect(HUB_MODULES.map((m) => m.id)).toEqual([
      'overview',
      'feed',
      'members',
      'friends',
      'groups',
      'people',
      'dating',
      'travel',
      'nearby',
      'plans',
      'saved',
      'progress',
    ]);
  });

  it('paths are static /hub routes (locale-collision-safe)', () => {
    for (const m of HUB_MODULES) {
      expect(m.path.startsWith('/hub')).toBe(true);
      expect(m.path).not.toContain(':');
      expect(m.path).not.toContain('?');
    }
  });

  it('overview is the default module at /hub', () => {
    const overview = HUB_MODULES.find((m) => m.id === 'overview');
    expect(overview?.path).toBe('/hub');
  });

  it('puts the community feed at /hub/feed', () => {
    const feed = HUB_MODULES.find((m) => m.id === 'feed');
    expect(feed?.path).toBe('/hub/feed');
  });

  it('does not hold messages — the inbox is its own page at /messages', () => {
    expect(HUB_MODULES.some((m) => m.path === '/hub/messages')).toBe(false);
  });
  it('keeps settings on /settings rather than a duplicate hub module', () => {
    expect(HUB_MODULES.some((module) => module.path === '/hub/settings')).toBe(false);
  });
});
