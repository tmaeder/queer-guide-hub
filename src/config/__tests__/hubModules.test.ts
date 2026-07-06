import { describe, it, expect } from 'vitest';
import { HUB_MODULES } from '../hubModules';

describe('hubModules registry', () => {
  it('has unique ids and paths', () => {
    const ids = HUB_MODULES.map((m) => m.id);
    const paths = HUB_MODULES.map((m) => m.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('exposes exactly the four consolidated modules', () => {
    expect(HUB_MODULES.map((m) => m.id)).toEqual(['overview', 'messages', 'plans', 'saved']);
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

  it('messages carries the unread badge', () => {
    const messages = HUB_MODULES.find((m) => m.id === 'messages');
    expect(messages?.path).toBe('/hub/messages');
    expect(messages?.badge).toBe('unread');
  });
});
