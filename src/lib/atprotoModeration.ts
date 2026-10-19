// Bluesky moderation semantics for queer.guide posts.
//
// We do not reimplement label/mute logic: a community_posts row is adapted into
// the post-view shape @atproto/api's `moderatePost` expects, and the decision the
// Bluesky app itself would make is returned. `@atproto/api` is ~180 KB gzipped,
// so it is loaded on demand (only when a post carries a label, or the viewer has
// mutes/muted words); until it resolves, callers treat labelled posts as blurred.
import type { AppBskyActorDefs, ModerationOpts, ModerationPrefs } from '@atproto/api';

/** Bluesky global self-label values we allow. Mirrors community_posts_labels_check. */
export const SELF_LABELS = ['porn', 'sexual', 'nudity', 'graphic-media'] as const;
export type SelfLabel = (typeof SELF_LABELS)[number];
export type LabelPreference = 'hide' | 'warn' | 'ignore';

export const SELF_LABEL_TEXT: Record<SelfLabel, string> = {
  porn: 'Adult content',
  sexual: 'Sexually suggestive',
  nudity: 'Non-sexual nudity',
  'graphic-media': 'Graphic media',
};

export type MutedWord = AppBskyActorDefs.MutedWord;

export interface ModeratablePost {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  labels?: string[] | null;
  tags?: string[] | null;
}

export interface ViewerModeration {
  userId: string | undefined;
  mutedUserIds: ReadonlySet<string>;
  mutedWords: MutedWord[];
  adultContentEnabled: boolean;
  labelPrefs: Partial<Record<SelfLabel, LabelPreference>>;
}

export interface PostModeration {
  /** Remove from lists entirely (muted author, muted word, label set to hide). */
  filter: boolean;
  /** Blur the post's images behind a click-through (Bluesky labels blur media, not text). */
  blurMedia: boolean;
  /** The click-through may not be opened (adult content while adult content is off). */
  noOverride: boolean;
  /** Human-readable reasons, for the gate's text label. */
  reasons: string[];
}

export const localDid = (userId: string) => `did:web:queer.guide:u:${userId}`;

export function needsModeration(posts: ModeratablePost[], viewer: ViewerModeration): boolean {
  return (
    viewer.mutedUserIds.size > 0 ||
    viewer.mutedWords.length > 0 ||
    posts.some((p) => (p.labels?.length ?? 0) > 0)
  );
}

/** What to show while @atproto/api is still loading: blur anything labelled. */
export function pendingModeration(post: ModeratablePost): PostModeration {
  const labels = (post.labels ?? []).filter((l): l is SelfLabel =>
    (SELF_LABELS as readonly string[]).includes(l),
  );
  return {
    filter: false,
    blurMedia: labels.length > 0,
    noOverride: labels.length > 0,
    reasons: labels.map((l) => SELF_LABEL_TEXT[l]),
  };
}

type AtprotoModule = typeof import('@atproto/api');
let modulePromise: Promise<AtprotoModule> | null = null;
export const loadAtproto = () => (modulePromise ??= import('@atproto/api'));

export function buildModerationOpts(
  mod: Pick<AtprotoModule, 'DEFAULT_LABEL_SETTINGS'>,
  viewer: ViewerModeration,
): ModerationOpts {
  const prefs: ModerationPrefs = {
    adultContentEnabled: viewer.adultContentEnabled,
    labels: { ...mod.DEFAULT_LABEL_SETTINGS, ...viewer.labelPrefs },
    labelers: [],
    mutedWords: viewer.mutedWords,
    hiddenPosts: [],
  };
  return { userDid: viewer.userId ? localDid(viewer.userId) : undefined, prefs };
}

export function decide(
  mod: Pick<AtprotoModule, 'moderatePost' | 'DEFAULT_LABEL_SETTINGS'>,
  post: ModeratablePost,
  viewer: ViewerModeration,
): PostModeration {
  const did = localDid(post.user_id);
  const uri = `at://${did}/app.bsky.feed.post/${post.id}`;
  const subject = {
    uri,
    cid: '',
    indexedAt: post.created_at,
    author: {
      did,
      handle: 'handle.invalid',
      viewer: { muted: viewer.mutedUserIds.has(post.user_id) },
    },
    record: {
      $type: 'app.bsky.feed.post',
      text: post.content ?? '',
      tags: post.tags ?? [],
      createdAt: post.created_at,
    },
    labels: (post.labels ?? []).map((val) => ({ src: did, uri, val, cts: post.created_at })),
  };
  const decision = mod.moderatePost(
    subject as Parameters<AtprotoModule['moderatePost']>[0],
    buildModerationOpts(mod, viewer),
  );
  const list = decision.ui('contentList');
  const media = decision.ui('contentMedia');

  const reasons = [...list.filters, ...media.blurs].map((cause) => {
    if (cause.type === 'label') {
      const v = cause.label.val as SelfLabel;
      return SELF_LABEL_TEXT[v] ?? v;
    }
    if (cause.type === 'muted') return 'You muted this account';
    if (cause.type === 'mute-word') return 'Contains a word you muted';
    return 'Hidden by your moderation settings';
  });
  return {
    filter: list.filter,
    blurMedia: media.blur,
    noOverride: media.noOverride,
    reasons: Array.from(new Set(reasons)),
  };
}
