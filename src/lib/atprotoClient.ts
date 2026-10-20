// "Sign in with Bluesky" + cross-posting, on the official atproto libraries.
//
// Public OAuth client (@atproto/oauth-client-browser): PKCE, PAR and DPoP are
// handled by the library, and the tokens live only in this browser's IndexedDB.
// Queer Guide stores no Bluesky secret — only the account's DID + handle, so
// the profile can show the link. Cost: Bluesky asks the user to sign in again
// after ~2 weeks, which is the documented limit for public clients.
//
// Both libraries are large, so everything here is loaded on demand.
import type { OAuthSession } from '@atproto/oauth-client-browser';
import { SELF_LABELS } from '@/lib/atprotoModeration';

export const BLUESKY_CLIENT_ID = 'https://queer.guide/oauth/client-metadata.json';
/** AppView used only to turn a typed handle into a DID before sign-in. */
const HANDLE_RESOLVER = 'https://bsky.social';
/** Bluesky's post length limit, in graphemes. */
export const BLUESKY_MAX_GRAPHEMES = 300;

type ClientModule = typeof import('@atproto/oauth-client-browser');
type Client = InstanceType<ClientModule['BrowserOAuthClient']>;

const isLoopback = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

let clientPromise: Promise<Client> | null = null;
export function loadBlueskyClient(): Promise<Client> {
  return (clientPromise ??= (async () => {
    const { BrowserOAuthClient, buildLoopbackClientId } =
      await import('@atproto/oauth-client-browser');
    // Local dev uses atproto's loopback client (no metadata document needed).
    const clientId = isLoopback() ? buildLoopbackClientId(window.location) : BLUESKY_CLIENT_ID;
    return BrowserOAuthClient.load({
      clientId,
      handleResolver: HANDLE_RESOLVER,
      responseMode: 'query',
    });
  })());
}

/** Sends the browser to the user's Bluesky server to approve the connection. */
export async function connectBluesky(handle: string, returnTo: string): Promise<never> {
  const client = await loadBlueskyClient();
  return client.signInRedirect(handle.trim().replace(/^@/, ''), { state: returnTo });
}

/** Completes the redirect on /oauth/callback. */
export async function completeBlueskyCallback() {
  const client = await loadBlueskyClient();
  const result = await client.initCallback();
  const handle = await handleFor(result.session);
  return { did: result.session.sub, handle, returnTo: result.state };
}

export async function restoreSession(did: string): Promise<OAuthSession | null> {
  try {
    return await (await loadBlueskyClient()).restore(did);
  } catch {
    return null; // expired or revoked: the user reconnects.
  }
}

export async function disconnectBluesky(did: string): Promise<void> {
  try {
    await (await loadBlueskyClient()).revoke(did);
  } catch {
    /* already gone */
  }
}

async function agentFor(session: OAuthSession) {
  const { Agent } = await import('@atproto/api');
  return new Agent(session);
}

async function handleFor(session: OAuthSession): Promise<string> {
  const agent = await agentFor(session);
  const { data } = await agent.getProfile({ actor: session.sub });
  return data.handle;
}

export interface CrossPostInput {
  id: string;
  content: string;
  labels?: string[] | null;
}

/** Fits text into Bluesky's grapheme limit, leaving room for the ellipsis. */
export function fitToBluesky(
  text: string,
  graphemes: (s: string) => number,
  max = BLUESKY_MAX_GRAPHEMES,
): string {
  if (graphemes(text) <= max) return text;
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const parts = Array.from(seg.segment(text), (s) => s.segment);
  return (
    parts
      .slice(0, max - 1)
      .join('')
      .trimEnd() + '…'
  );
}

/** Bluesky self-labels allowed through: only Bluesky's global values. */
export function selfLabelsFor(labels: string[] | null | undefined) {
  const values = (labels ?? []).filter((l) => (SELF_LABELS as readonly string[]).includes(l));
  return values.length
    ? {
        $type: 'com.atproto.label.defs#selfLabels' as const,
        values: values.map((val) => ({ val })),
      }
    : undefined;
}

/**
 * Writes the post to the user's OWN Bluesky repo (app.bsky.feed.post) with a
 * link card back to the Queer Guide permalink. Returns the record's at:// URI.
 */
export async function crossPostToBluesky(did: string, post: CrossPostInput) {
  const session = await restoreSession(did);
  if (!session) throw new Error('Bluesky session expired — reconnect in Settings.');
  const agent = await agentFor(session);
  const { RichText } = await import('@atproto/api');
  const url = `https://queer.guide/posts/${post.id}`;
  const rt = new RichText({
    text: fitToBluesky(post.content, (s) => new RichText({ text: s }).graphemeLength),
  });
  await rt.detectFacets(agent);
  const res = await agent.post({
    text: rt.text,
    facets: rt.facets,
    labels: selfLabelsFor(post.labels),
    embed: {
      $type: 'app.bsky.embed.external',
      external: { uri: url, title: 'Post on Queer Guide', description: post.content.slice(0, 200) },
    },
    createdAt: new Date().toISOString(),
  });
  return { uri: res.uri, cid: res.cid };
}

export async function deleteBlueskyPost(did: string, uri: string): Promise<void> {
  const session = await restoreSession(did);
  if (!session) return;
  await (await agentFor(session)).deletePost(uri);
}
