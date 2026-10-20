// Open web identity: /@handle profile pages, Atom feeds, WebFinger, oEmbed.
//
// Privacy model (Phase 2 of the AT Protocol standards plan):
//  - /@handle resolves for any existing handle, but what it shows comes from
//    get_public_profile_safe called ANONYMOUSLY — the same gate the SPA profile
//    uses — so a private profile reveals nothing beyond the handle existing
//    (which username_available() already reveals).
//  - Feeds and WebFinger only ever list accounts that opted in
//    (privacy_settings.open_web = true) AND have a public profile; the SQL side
//    (resolve_handle / open_web_posts) enforces both.
import type { Env } from './sitemap';
import type { DetailResult } from './detail';
import { SITE_ORIGIN } from './routeMeta';

export const HANDLE_PATH_RE = /^\/@([A-Za-z0-9._]{3,20})\/?$/;

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** POST /rest/v1/rpc/<fn>. Uses the ANON key so SECURITY DEFINER functions see
 *  an anonymous viewer (auth.uid() null) exactly as a logged-out visitor would. */
export async function rpc<T>(
  env: Env,
  fn: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const key = env.SUPABASE_ANON_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type ResolvedHandle =
  | { user_id: string; username: string; open_web: boolean; redirect?: undefined }
  | { redirect: string; user_id?: undefined };

export function resolveHandle(env: Env, handle: string) {
  return rpc<ResolvedHandle | null>(env, 'resolve_handle', { p_handle: handle });
}

type PublicProfile = {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  website?: string | null;
  social_links?: unknown;
  locked?: boolean;
};

/** Every http(s) URL in a profile's website + social_links (any jsonb shape). */
export function profileLinks(p: Pick<PublicProfile, 'website' | 'social_links'>): string[] {
  const out = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === 'string') {
      if (/^https?:\/\/\S+$/i.test(v.trim())) out.add(v.trim());
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(p.website);
  visit(p.social_links);
  return [...out];
}

export type HandleRoute =
  | { status: 404 }
  | { status: 301; location: string }
  | { status: 200; detail: DetailResult; userId: string };

/** Server side of /@handle: meta for crawlers + rel=me / feed discovery links. */
export async function resolveHandleRoute(env: Env, basePath: string): Promise<HandleRoute | null> {
  const m = HANDLE_PATH_RE.exec(basePath);
  if (!m) return null;
  const resolved = await resolveHandle(env, m[1]);
  if (!resolved) return { status: 404 };
  if (resolved.redirect) return { status: 301, location: `/@${resolved.redirect}` };
  if (!resolved.user_id) return { status: 404 };

  const profile = await rpc<PublicProfile | null>(env, 'get_public_profile_safe', {
    target_user_id: resolved.user_id,
  });
  const handle = resolved.username;
  const name = profile?.display_name || `@${handle}`;
  const head: string[] = [];
  if (profile && !profile.locked) {
    for (const href of profileLinks(profile)) {
      head.push(`<link rel="me" href="${escapeXml(href)}">`);
    }
  }
  if (resolved.open_web) {
    head.push(
      `<link rel="alternate" type="application/atom+xml" title="${escapeXml(name)}" href="${SITE_ORIGIN}/feeds/u/${handle}">`,
    );
  }
  const links = profile && !profile.locked ? profileLinks(profile) : [];
  return {
    status: 200,
    userId: resolved.user_id,
    detail: {
      meta: {
        title: `${name} (@${handle}) | Queer Guide`,
        description: (profile && !profile.locked && profile.bio) || `@${handle} on Queer Guide`,
        ogImage: profile?.avatar_url ?? undefined,
      },
      // Bot body: the visible rel=me anchors are what Mastodon-style verifiers read.
      body:
        `<h1>${escapeXml(name)}</h1><p>@${escapeXml(handle)}</p>` +
        (links.length
          ? `<ul>${links.map((h) => `<li><a rel="me" href="${escapeXml(h)}">${escapeXml(h)}</a></li>`).join('')}</ul>`
          : ''),
      jsonLd: head.join('\n    '),
      // Profiles are deliberately not indexed (the SPA profile is noIndex too).
      indexable: false,
    },
  };
}

export type FeedPost = {
  id: string;
  username: string;
  display_name: string | null;
  content: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string | null;
};

/** RFC 4287 Atom document. */
export function atomFeed(opts: {
  id: string;
  title: string;
  selfUrl: string;
  altUrl: string;
  posts: FeedPost[];
}): string {
  const updated =
    opts.posts[0]?.updated_at ?? opts.posts[0]?.created_at ?? new Date(0).toISOString();
  const entries = opts.posts
    .map((p) => {
      const url = `${SITE_ORIGIN}/posts/${p.id}`;
      const title = p.content.split('\n')[0].slice(0, 80) || 'Post';
      return [
        '  <entry>',
        `    <id>${url}</id>`,
        `    <title>${escapeXml(title)}</title>`,
        `    <link rel="alternate" href="${url}"/>`,
        `    <published>${new Date(p.created_at).toISOString()}</published>`,
        `    <updated>${new Date(p.updated_at ?? p.created_at).toISOString()}</updated>`,
        `    <author><name>${escapeXml(p.display_name || p.username)}</name><uri>${SITE_ORIGIN}/@${p.username}</uri></author>`,
        ...(p.tags ?? []).map((t) => `    <category term="${escapeXml(t)}"/>`),
        `    <content type="text">${escapeXml(p.content)}</content>`,
        '  </entry>',
      ].join('\n');
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(opts.id)}</id>`,
    `  <title>${escapeXml(opts.title)}</title>`,
    `  <updated>${new Date(updated).toISOString()}</updated>`,
    `  <link rel="self" href="${escapeXml(opts.selfUrl)}"/>`,
    `  <link rel="alternate" href="${escapeXml(opts.altUrl)}"/>`,
    entries,
    '</feed>',
  ].join('\n');
}

export function atomResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

/** Strips a trailing .atom/.xml so /feeds/u/alice and /feeds/u/alice.atom both work. */
export const feedParam = (raw: string | string[] | undefined) =>
  decodeURIComponent(String(Array.isArray(raw) ? raw[0] : (raw ?? ''))).replace(
    /\.(atom|xml)$/i,
    '',
  );
