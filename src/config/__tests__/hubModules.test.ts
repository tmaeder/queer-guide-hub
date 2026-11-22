import { describe, it, expect } from 'vitest';
import { HUB_MODULES } from '../hubModules';
import { MEET_MODULES, getActiveMeetModule } from '../meetModules';

describe('hubModules registry', () => {
  it('has unique ids and paths', () => {
    const ids = HUB_MODULES.map((m) => m.id);
    const paths = HUB_MODULES.map((m) => m.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('holds only personal modules; public discovery lives in Meet', () => {
    expect(HUB_MODULES.map((m) => m.id)).toEqual([
      'overview',
      'feed',
      'friends',
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

describe('meetModules registry', () => {
  it('lists the public discovery tabs under /meet', () => {
    expect(MEET_MODULES.map((m) => m.path)).toEqual([
      '/meet',
      '/meet/members',
      '/meet/groups',
      '/meet/travel',
      '/meet/nearby',
      '/meet/dating',
    ]);
  });

  it('shares no route with the Hub', () => {
    const hub = new Set(HUB_MODULES.map((m) => m.path));
    for (const m of MEET_MODULES) expect(hub.has(m.path), m.path).toBe(false);
    expect(HUB_MODULES.every((m) => m.path.startsWith('/hub'))).toBe(true);
  });

  it('gates only Dating behind sign-in', () => {
    expect(MEET_MODULES.filter((m) => m.signedInOnly).map((m) => m.id)).toEqual(['dating']);
  });

  it('resolves the active tab from the URL, locale and sub-paths included', () => {
    expect(getActiveMeetModule('/meet')?.id).toBe('people');
    expect(getActiveMeetModule('/de/meet/groups/g1')?.id).toBe('groups');
    expect(getActiveMeetModule('/meet/dating/onboarding')?.id).toBe('dating');
    expect(getActiveMeetModule('/hub/feed')).toBeUndefined();
  });
});
