import type { Env } from '../../_lib/sitemap';
import {
  atomFeed,
  atomResponse,
  feedParam,
  notFound,
  resolveHandle,
  rpc,
  type FeedPost,
} from '../../_lib/openWeb';
import { SITE_ORIGIN } from '../../_lib/routeMeta';

// Atom feed of one account's public, unlabelled posts. Opt-in only:
// 404 unless the account set privacy_settings.open_web and is public.
export const onRequest: PagesFunction<Env> = async ({ env, params }) => {
  const handle = feedParam(params.handle).toLowerCase();
  const resolved = await resolveHandle(env, handle);
  if (!resolved?.user_id || !resolved.open_web) return notFound();
  const posts =
    (await rpc<FeedPost[]>(env, 'open_web_posts', { p_handle: resolved.username })) ?? [];
  return atomResponse(
    atomFeed({
      id: `${SITE_ORIGIN}/feeds/u/${resolved.username}`,
      title: `@${resolved.username} on Queer Guide`,
      selfUrl: `${SITE_ORIGIN}/feeds/u/${resolved.username}`,
      altUrl: `${SITE_ORIGIN}/@${resolved.username}`,
      posts,
    }),
  );
};
