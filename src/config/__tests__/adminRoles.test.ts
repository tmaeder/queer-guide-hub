import { describe, it, expect } from 'vitest';
import { roleAtLeast } from '../adminRoles';
import { getRouteMinRole } from '../adminNavigation';

describe('roleAtLeast', () => {
  it('ranks admin > moderator > editor > viewer > none', () => {
    expect(roleAtLeast('admin', 'admin')).toBe(true);
    expect(roleAtLeast('moderator', 'admin')).toBe(false);
    expect(roleAtLeast('editor', 'moderator')).toBe(false);
    expect(roleAtLeast('editor', 'editor')).toBe(true);
    expect(roleAtLeast('viewer', 'editor')).toBe(false);
    expect(roleAtLeast('none', 'viewer')).toBe(false);
    expect(roleAtLeast('admin', 'viewer')).toBe(true);
  });
});

describe('getRouteMinRole', () => {
  it('gates content + import-review routes at editor', () => {
    expect(getRouteMinRole('/admin/content/venues')).toBe('editor');
    expect(getRouteMinRole('/admin/review')).toBe('editor');
    expect(getRouteMinRole('/admin')).toBe('editor');
    expect(getRouteMinRole('/admin/inbox')).toBe('editor');
  });

  it('gates automation adminOnly items at admin, base automation at moderator', () => {
    expect(getRouteMinRole('/admin/automation')).toBe('moderator');
    expect(getRouteMinRole('/admin/pipelines')).toBe('admin');
    expect(getRouteMinRole('/admin/ingestion-rules')).toBe('admin');
  });

  it('gates system adminOnly pages at admin, settings at moderator', () => {
    expect(getRouteMinRole('/admin/users')).toBe('admin');
    expect(getRouteMinRole('/admin/security')).toBe('admin');
    expect(getRouteMinRole('/admin/audit')).toBe('admin');
    expect(getRouteMinRole('/admin/settings')).toBe('moderator');
  });

  it('inherits parent tier via longest-prefix for sub-routes', () => {
    // settings sub-pages inherit the moderator tier of /admin/settings
    expect(getRouteMinRole('/admin/settings/venue-categories')).toBe('moderator');
    // a content sub-path inherits editor
    expect(getRouteMinRole('/admin/content/venues/anything')).toBe('editor');
  });

  it('defaults unknown admin routes to editor (entry floor)', () => {
    expect(getRouteMinRole('/admin/some-unmapped-route')).toBe('editor');
  });
});
