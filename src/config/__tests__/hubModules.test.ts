import { describe, it, expect } from 'vitest';
import { HUB_MODULES } from '../hubModules';

describe('hubModules registry', () => {
  it('has unique ids and paths', () => {
    const ids = HUB_MODULES.map((m) => m.id);
    const paths = HUB_MODULES.map((m) => m.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('paths are static /hub routes (locale-collision-safe)', () => {
    for (const m of HUB_MODULES) {
      expect(m.path.startsWith('/hub')).toBe(true);
      expect(m.path).not.toContain(':');
      expect(m.path).not.toContain('?');
    }
  });

  it('inbox is the default module at /hub and carries the unread badge', () => {
    const inbox = HUB_MODULES.find((m) => m.id === 'inbox');
    expect(inbox?.path).toBe('/hub');
    expect(inbox?.badge).toBe('unread');
  });
});
