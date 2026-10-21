import { afterEach, describe, expect, it, vi } from 'vitest';
import { feedSkeleton, feedUri, type FeedEnv } from './feedGenerator';

const base = { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon' };
const env = (publisher?: string) =>
  ({ ...base, FEED_PUBLISHER_DID: publisher }) as unknown as FeedEnv;
const FEED = 'at://did:plc:pub/app.bsky.feed.generator/queer-guide';

function mockRows(rows: unknown[]) {
  const f = vi.fn(async () => new Response(JSON.stringify(rows)));
  vi.stubGlobal('fetch', f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

describe('feedSkeleton', () => {
  it('returns post URIs and a cursor when the page is full', async () => {
    mockRows([
      { post_uri: 'at://a/app.bsky.feed.post/1', next_cursor: 'c1' },
      { post_uri: 'at://a/app.bsky.feed.post/2', next_cursor: 'c2' },
    ]);
    const res = await feedSkeleton(
      env('did:plc:pub'),
      new URL(`https://queer.guide/x?feed=${FEED}&limit=2`),
    );
    expect(await res.json()).toEqual({
      feed: [{ post: 'at://a/app.bsky.feed.post/1' }, { post: 'at://a/app.bsky.feed.post/2' }],
      cursor: 'c2',
    });
  });

  it('omits the cursor on the last page', async () => {
    mockRows([{ post_uri: 'at://a/app.bsky.feed.post/1', next_cursor: 'c1' }]);
    const body = (await (
      await feedSkeleton(env(), new URL(`https://queer.guide/x?feed=${FEED}`))
    ).json()) as { cursor?: string };
    expect(body.cursor).toBeUndefined();
  });

  it('rejects a feed it does not serve, without touching the DB', async () => {
    const f = mockRows([]);
    const res = await feedSkeleton(
      env('did:plc:pub'),
      new URL('https://queer.guide/x?feed=at://did:plc:other/app.bsky.feed.generator/queer-guide'),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'UnknownFeed' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('feedUri', () => {
  it('is null until the publisher DID is configured', () => {
    expect(feedUri(env())).toBeNull();
    expect(feedUri(env('did:plc:pub'))).toBe(FEED);
  });
});
