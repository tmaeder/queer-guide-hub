import { feedSkeleton, type FeedEnv } from '../_lib/feedGenerator';

export const onRequest: PagesFunction<FeedEnv> = ({ env, request }) =>
  feedSkeleton(env, new URL(request.url));
