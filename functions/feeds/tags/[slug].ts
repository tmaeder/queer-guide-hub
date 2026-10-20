import type { Env } from '../../_lib/sitemap';
import {
  atomFeed,
  atomResponse,
  feedParam,
  notFound,
  rpc,
  type FeedPost,
} from '../../_lib/openWeb';
import { SITE_ORIGIN } from '../../_lib/routeMeta';

// Atom feed of public, unlabelled posts tagged #slug, from opted-in accounts only.
export const onRequest: PagesFunction<Env> = async ({ env, params }) => {
  const tag = feedParam(params.slug).toLowerCase();
  if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(tag)) return notFound();
  const posts = (await rpc<FeedPost[]>(env, 'open_web_posts', { p_tag: tag })) ?? [];
  return atomResponse(
    atomFeed({
      id: `${SITE_ORIGIN}/feeds/tags/${encodeURIComponent(tag)}`,
      title: `#${tag} on Queer Guide`,
      selfUrl: `${SITE_ORIGIN}/feeds/tags/${encodeURIComponent(tag)}`,
      altUrl: `${SITE_ORIGIN}/hub/feed`,
      posts,
    }),
  );
};
