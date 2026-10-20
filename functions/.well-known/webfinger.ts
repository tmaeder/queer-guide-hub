import type { Env } from '../_lib/sitemap';
import { resolveHandle } from '../_lib/openWeb';
import { SITE_ORIGIN } from '../_lib/routeMeta';

// RFC 7033 WebFinger: acct:handle@queer.guide → profile page + Atom feed.
// Opt-in only (privacy_settings.open_web): everyone else is a 404, so the
// endpoint cannot be used to enumerate members.
export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const resource = new URL(request.url).searchParams.get('resource') ?? '';
  const m = /^acct:@?([A-Za-z0-9._]{3,20})@(?:www\.)?queer\.guide$/i.exec(resource.trim());
  if (!m) return new Response('Bad resource', { status: 400 });
  const resolved = await resolveHandle(env, m[1]);
  if (!resolved?.user_id || !resolved.open_web) return new Response('Not found', { status: 404 });
  const profile = `${SITE_ORIGIN}/@${resolved.username}`;
  return new Response(
    JSON.stringify({
      subject: `acct:${resolved.username}@queer.guide`,
      aliases: [profile],
      links: [
        { rel: 'http://webfinger.net/rel/profile-page', type: 'text/html', href: profile },
        {
          rel: 'alternate',
          type: 'application/atom+xml',
          href: `${SITE_ORIGIN}/feeds/u/${resolved.username}`,
        },
      ],
    }),
    {
      headers: {
        'Content-Type': 'application/jrd+json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=300, max-age=60',
      },
    },
  );
};
