// Bluesky feed generator (Phase 5). Spec: app.bsky.feed.getFeedSkeleton /
// describeFeedGenerator, service identity did:web:queer.guide with a
// #bsky_fg service (see functions/.well-known/did.json.ts).
import type { Env } from './sitemap';
import { rpc } from './openWeb';

export const SERVICE_DID = 'did:web:queer.guide';
/** Record key of the feed under the publishing account. */
export const FEED_RKEY = 'queer-guide';

export type FeedEnv = Env & { FEED_PUBLISHER_DID?: string };

export function feedUri(env: FeedEnv): string | null {
  return env.FEED_PUBLISHER_DID
    ? `at://${env.FEED_PUBLISHER_DID}/app.bsky.feed.generator/${FEED_RKEY}`
    : null;
}

export const xrpcJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
    },
  });

export async function feedSkeleton(env: FeedEnv, url: URL): Promise<Response> {
  const feed = url.searchParams.get('feed') ?? '';
  const expected = feedUri(env);
  // Unknown feed -> the XRPC error Bluesky expects.
  if (!feed.endsWith(`/app.bsky.feed.generator/${FEED_RKEY}`) || (expected && feed !== expected)) {
    return xrpcJson({ error: 'UnknownFeed', message: 'Unknown feed' }, 400);
  }
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 30) || 30, 1), 100);
  const cursor = url.searchParams.get('cursor');
  const rows =
    (await rpc<{ post_uri: string; next_cursor: string }[]>(env, 'bluesky_feed_skeleton', {
      p_cursor: cursor,
      p_limit: limit,
    })) ?? [];
  return xrpcJson({
    feed: rows.map((r) => ({ post: r.post_uri })),
    ...(rows.length === limit ? { cursor: rows[rows.length - 1].next_cursor } : {}),
  });
}
