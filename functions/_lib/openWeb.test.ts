import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './sitemap';
import { HANDLE_PATH_RE, atomFeed, feedParam, profileLinks, resolveHandleRoute } from './openWeb';

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon' } as unknown as Env;

function mockRpc(responses: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const fn = url.split('/rpc/')[1];
      calls.push(fn);
      return new Response(JSON.stringify(responses[fn] ?? null), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('HANDLE_PATH_RE', () => {
  it('matches /@handle only', () => {
    expect(HANDLE_PATH_RE.exec('/@alice.b')?.[1]).toBe('alice.b');
    expect(HANDLE_PATH_RE.test('/@ab')).toBe(false);
    expect(HANDLE_PATH_RE.test('/@alice/extra')).toBe(false);
    expect(HANDLE_PATH_RE.test('/alice')).toBe(false);
  });
});

describe('profileLinks', () => {
  it('collects http(s) URLs from any jsonb shape, ignoring junk', () => {
    expect(
      profileLinks({
        website: 'https://example.org',
        social_links: {
          bluesky: 'https://bsky.app/profile/a',
          x: 'not a url',
          list: ['https://m.social/@a'],
        },
      }),
    ).toEqual(['https://example.org', 'https://bsky.app/profile/a', 'https://m.social/@a']);
    expect(profileLinks({ website: 'javascript:alert(1)', social_links: null })).toEqual([]);
  });
});

describe('atomFeed', () => {
  it('escapes post content and emits one entry per post', () => {
    const xml = atomFeed({
      id: 'x',
      title: 'T',
      selfUrl: 'https://queer.guide/feeds/u/a',
      altUrl: 'https://queer.guide/@a',
      posts: [
        {
          id: 'p1',
          username: 'a',
          display_name: null,
          content: 'Pride <script>alert(1)</script> & more',
          tags: ['pride'],
          created_at: '2026-10-01T00:00:00Z',
          updated_at: null,
        },
      ],
    });
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).not.toContain('<script>');
    expect(xml.match(/<entry>/g)).toHaveLength(1);
    expect(xml).toContain('<category term="pride"/>');
  });

  it('feedParam strips .atom/.xml', () => {
    expect(feedParam('alice.atom')).toBe('alice');
    expect(feedParam(['bob.xml'])).toBe('bob');
  });
});

describe('resolveHandleRoute', () => {
  it('ignores non-handle paths without a network call', async () => {
    const calls = mockRpc({});
    expect(await resolveHandleRoute(env, '/venues')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('404s an unknown handle', async () => {
    mockRpc({ resolve_handle: null });
    expect(await resolveHandleRoute(env, '/@ghost')).toEqual({ status: 404 });
  });

  it('301s a renamed handle', async () => {
    mockRpc({ resolve_handle: { redirect: 'newname' } });
    expect(await resolveHandleRoute(env, '/@oldname')).toEqual({
      status: 301,
      location: '/@newname',
    });
  });

  it('emits rel=me links and the feed only when allowed', async () => {
    mockRpc({
      resolve_handle: { user_id: 'u1', username: 'alice', open_web: true },
      get_public_profile_safe: {
        user_id: 'u1',
        display_name: 'Alice',
        social_links: { mastodon: 'https://m.social/@alice' },
      },
    });
    const r = await resolveHandleRoute(env, '/@alice');
    expect(r?.status).toBe(200);
    if (r?.status !== 200) return;
    expect(r.detail.jsonLd).toContain('<link rel="me" href="https://m.social/@alice">');
    expect(r.detail.jsonLd).toContain('application/atom+xml');
    expect(r.detail.indexable).toBe(false);
  });

  it('leaks nothing from a locked or private profile, and no feed without opt-in', async () => {
    mockRpc({
      resolve_handle: { user_id: 'u2', username: 'bob', open_web: false },
      get_public_profile_safe: {
        user_id: 'u2',
        locked: true,
        social_links: { x: 'https://x.test/bo' },
        bio: 'secret',
      },
    });
    const r = await resolveHandleRoute(env, '/@bob');
    if (r?.status !== 200) throw new Error('expected 200');
    expect(r.detail.jsonLd).toBe('');
    expect(r.detail.meta.description).not.toContain('secret');
    expect(r.detail.body).not.toContain('x.test');
  });
});
