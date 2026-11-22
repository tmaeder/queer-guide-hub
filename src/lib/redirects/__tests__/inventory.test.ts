import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  filterInventory,
  loadDatabaseInventory,
  loadSlugSource,
  manualRedirect,
  inventoryDomain,
  inventoryDomainFacets,
  parseClientRedirects,
  parseStaticRedirects,
  readInventoryPages,
  SLUG_SOURCES,
} from '../inventory';

describe('complete redirect inventory', () => {
  it('lists a managed root by its branded homepage rather than its internal slug', () => {
    const row = manualRedirect({
      id: 'root',
      type: 'SHORT',
      slug: 'internal-key',
      domain_id: 'domain',
      domain_hostname: 'links.community.com',
      is_domain_root: true,
      target: '/events',
      is_enabled: true,
    });
    expect(row.source).toBe('https://links.community.com/');
    expect(inventoryDomain(row)).toBe('links.community.com');
  });
  it('loads beyond the Data API cap even when the server returns fewer than 1000 rows', async () => {
    const rows = Array.from({ length: 2501 }, (_, id) => ({ id }));
    const offsets: number[] = [];
    const result = await readInventoryPages(async (offset) => {
      offsets.push(offset);
      return { data: rows.slice(offset, offset + 500), count: rows.length, error: null };
    });
    expect(result).toEqual(rows);
    expect(offsets).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });

  it('does not silently return an empty or truncated list on a source error', async () => {
    await expect(
      readInventoryPages(async () => ({ data: [], count: 2, error: null })),
    ).rejects.toThrow('before all records');
    await expect(
      readInventoryPages(async () => ({
        data: null,
        count: null,
        error: { message: 'permission denied' },
      })),
    ).rejects.toThrow('permission denied');
  });

  it('uses current canonical slugs and retains unresolved aliases', async () => {
    const read = vi.fn(async (table: string) =>
      table === 'event_slug_redirects'
        ? [
            { old_slug: 'old-event', event_id: '1' },
            { old_slug: 'removed-event', event_id: '2' },
          ]
        : [{ id: '1', slug: 'current-event' }],
    );
    const rows = await loadSlugSource(
      SLUG_SOURCES.find((s) => s.table === 'event_slug_redirects')!,
      read,
    );
    expect(rows[0].target).toBe('/events/current-event');
    expect(rows[1]).toMatchObject({
      source: '/events/removed-event',
      target: null,
      state: 'Missing target',
    });
    expect(read).toHaveBeenLastCalledWith('events', 'id,slug', 'id', {
      column: 'id',
      values: ['1', '2'],
    });
  });

  it('includes automatic and legacy redirects when the manual table is empty, and names failed sources', async () => {
    const result = await loadDatabaseInventory(async (table) => {
      if (table === 'venue_slug_redirects') return [{ old_slug: 'old', venue_id: '1' }];
      if (table === 'venues') return [{ id: '1', slug: 'new' }];
      if (table === 'venue_redirects')
        return [{ id: 'legacy', slug_from: 'legacy', slug_to: 'new' }];
      if (table === 'event_slug_redirects') throw new Error('permission denied');
      return [];
    });
    expect(result.rows.map((r) => r.source)).toEqual(['/venues/old', '/venues/legacy']);
    expect(result.errors).toEqual(['event_slug_redirects: permission denied']);
  });

  it('includes HTTP redirects while excluding comments and SPA rewrites', () => {
    const rows = parseStaticRedirects(
      '# comment\n/old /new 301\n/* /index.html 200\n/shop/* /marketplace/:splat 308!\n/no-status /new',
    );
    expect(rows.map((r) => r.statusCode)).toEqual([301, 308]);
    expect(rows[1].source).toBe('/shop/*');
    const real = parseStaticRedirects(
      readFileSync(join(__dirname, '../../../../public/_redirects'), 'utf8'),
    );
    expect(real.length).toBeGreaterThan(100);
    expect(real.some((r) => r.source === '/villages/sitges' && r.target === '/city/sitges')).toBe(
      true,
    );
  });

  it('includes actual admin and locale-aware client aliases without inventing HTTP codes', () => {
    const real = parseClientRedirects(readFileSync(join(__dirname, '../../../routes.tsx'), 'utf8'));
    expect(real).toContainEqual(
      expect.objectContaining({
        source: '/admin/redirects',
        target: '/admin/content/redirects',
        statusCode: null,
      }),
    );
    expect(real).toContainEqual(
      expect.objectContaining({
        source: '/geography/:slug',
        target: '/city/:slug',
        statusCode: null,
      }),
    );
    expect(real).toContainEqual(
      expect.objectContaining({ source: '/groups/:groupId', target: '/meet/groups/:groupId' }),
    );
    expect(real).toContainEqual(
      expect.objectContaining({ source: '/login', target: '/auth', statusCode: null }),
    );
    expect(real).toContainEqual(
      expect.objectContaining({
        source: '/profession/:slug',
        target: '/personalities?profession=:slug',
      }),
    );
  });

  it('groups source domains without confusing destination hosts or builtin aliases', () => {
    const builtin = manualRedirect({
      id: 'site',
      type: 'PATH',
      source_path: '/old',
      target: 'https://elsewhere.example/events',
      is_enabled: true,
      status_code: 301,
    });
    const custom = manualRedirect({
      id: 'brand',
      type: 'SHORT',
      slug: 'promo',
      domain_id: 'domain',
      domain_hostname: 'links.community.com',
      target: '/events',
      is_enabled: false,
      status_code: 302,
    });
    const alias = { ...builtin, id: 'alias', source: 'https://www.queer.guide/old' };
    expect(inventoryDomain(builtin)).toBe('queer.guide');
    expect(inventoryDomain(alias)).toBe('queer.guide');
    expect(inventoryDomainFacets([builtin, alias, custom])).toContainEqual({
      hostname: 'queer.guide',
      count: 2,
    });
    expect(filterInventory([builtin, custom], '', '', '', 'links.community.com')).toEqual([custom]);
    expect(filterInventory([builtin, alias, custom], '', '', '', 'WWW.QUEER.GUIDE')).toEqual([
      builtin,
      alias,
    ]);
  });
  it('retains branded sources and domain identity in the all-source inventory', () => {
    const row = manualRedirect({
      id: 'custom',
      type: 'SHORT',
      slug: 'same-link',
      domain_id: 'domain-a',
      domain_hostname: 'links.community.com',
      target: '/events',
      is_enabled: true,
      status_code: 302,
    });
    expect(row).toMatchObject({
      source: 'https://links.community.com/same-link',
      domainHostname: 'links.community.com',
      isShortLink: true,
      manualId: 'custom',
    });
  });
  it('shows configured manual state and searches destinations and origins', () => {
    const row = manualRedirect({
      id: '1',
      type: 'SHORT',
      slug: 'promo',
      target: '/events/new',
      is_enabled: true,
      status_code: 302,
      end_at: '2020-01-01',
    });
    expect(row).toMatchObject({
      source: '/go/promo',
      manualId: '1',
      state: 'Expired',
      statusCode: 302,
    });
    expect(filterInventory([row], 'EVENTS', '', '')).toEqual([row]);
    expect(filterInventory([row], '', 'redirects', 'Disabled')).toEqual([]);
  });
});
