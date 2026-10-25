import { describe, expect, it } from 'vitest';
import { adminNavSections, getRouteMinRole } from '../adminNavigation';
import { getAdminNavSearchText, matchesAdminNavSearch } from '../adminNavSearch';

const find = (id: string) => {
  const section = adminNavSections.find((section) => section.items.some((item) => item.id === id))!;
  return { section, item: section.items.find((item) => item.id === id)! };
};

describe('admin navigation search', () => {
  it.each([
    ['postfach', 'POSTFACH'],
    ['geography', 'countries'],
    ['geography', 'cities'],
    ['organizations', 'hotels'],
    ['tags', 'taxonomy'],
    ['overview', 'places editorial'],
    ['overview', 'editorial drafts'],
    ['cloudflare', 'cloudflare'],
    ['email', 'templates'],
    ['email', 'designer'],
  ])('finds %s by its familiar alias %s', (id, query) => {
    const { item, section } = find(id);
    expect(matchesAdminNavSearch(item, section, query)).toBe(true);
  });

  it('matches section and group names and requires every query word', () => {
    const { item, section } = find('events');
    expect(matchesAdminNavSearch(item, section, 'content places')).toBe(true);
    expect(matchesAdminNavSearch(item, section, 'events security')).toBe(false);
    expect(getAdminNavSearchText(item, section)).toContain('Places & events');
  });

  it('keeps join decisions moderator-only in the canonical Groups workspace', () => {
    const { item } = find('groups');
    expect(item.route).toBe('/admin/content/community_groups');
    expect(getRouteMinRole(item.route)).toBe('editor');
    expect(getRouteMinRole(`${item.route}/requests`)).toBe('moderator');
    expect(getRouteMinRole('/admin/content/group-requests')).toBe('moderator');
  });
});
