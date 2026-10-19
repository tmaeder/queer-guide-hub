import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as atproto from '@atproto/api';
import {
  SELF_LABELS,
  decide,
  needsModeration,
  pendingModeration,
  type ModeratablePost,
  type ViewerModeration,
} from '../atprotoModeration';

const post = (over: Partial<ModeratablePost> = {}): ModeratablePost => ({
  id: 'p1',
  user_id: 'author',
  content: 'Pride picnic in the park on Saturday',
  created_at: '2026-10-19T12:00:00.000Z',
  labels: [],
  tags: [],
  ...over,
});

const viewer = (over: Partial<ViewerModeration> = {}): ViewerModeration => ({
  userId: 'viewer',
  mutedUserIds: new Set(),
  mutedWords: [],
  adultContentEnabled: false,
  labelPrefs: {},
  ...over,
});

describe('decide() uses the real @atproto/api moderatePost (Bluesky defaults)', () => {
  it('leaves an unlabelled post alone', () => {
    expect(decide(atproto, post(), viewer())).toMatchObject({ filter: false, blurMedia: false });
  });

  it('porn with adult content off: filtered from lists, media gate cannot be opened', () => {
    const d = decide(atproto, post({ labels: ['porn'] }), viewer());
    expect(d.filter).toBe(true);
    expect(d.noOverride).toBe(true);
    expect(d.reasons).toContain('Adult content');
  });

  it('sexual with adult content on: stays in the list, media blurred, gate can be opened', () => {
    const d = decide(atproto, post({ labels: ['sexual'] }), viewer({ adultContentEnabled: true }));
    expect(d).toMatchObject({ filter: false, blurMedia: true, noOverride: false });
  });

  it('a viewer preference of ignore removes the warning (adult content on)', () => {
    const d = decide(
      atproto,
      post({ labels: ['graphic-media'] }),
      viewer({ adultContentEnabled: true, labelPrefs: { 'graphic-media': 'ignore' } }),
    );
    expect(d).toMatchObject({ filter: false, blurMedia: false });
  });

  it('nudity is ignored by default, as on Bluesky', () => {
    expect(decide(atproto, post({ labels: ['nudity'] }), viewer())).toMatchObject({
      filter: false,
      blurMedia: false,
    });
  });

  it('anonymous viewers never see porn', () => {
    expect(decide(atproto, post({ labels: ['porn'] }), viewer({ userId: undefined })).filter).toBe(
      true,
    );
  });

  it('filters a muted author out of lists', () => {
    const d = decide(atproto, post(), viewer({ mutedUserIds: new Set(['author']) }));
    expect(d.filter).toBe(true);
    expect(d.reasons).toContain('You muted this account');
  });

  it('filters a post containing a muted word', () => {
    const d = decide(
      atproto,
      post(),
      viewer({ mutedWords: [{ value: 'picnic', targets: ['content'], actorTarget: 'all' }] }),
    );
    expect(d.filter).toBe(true);
    expect(d.reasons).toContain('Contains a word you muted');
  });

  it('never filters your own post by muted word', () => {
    const d = decide(
      atproto,
      post({ user_id: 'viewer' }),
      viewer({ mutedWords: [{ value: 'picnic', targets: ['content'], actorTarget: 'all' }] }),
    );
    expect(d.filter).toBe(false);
  });
});

describe('loading fallbacks', () => {
  it('blurs labelled posts while @atproto/api is loading', () => {
    expect(pendingModeration(post({ labels: ['sexual'] }))).toMatchObject({ blurMedia: true });
    expect(pendingModeration(post())).toMatchObject({ blurMedia: false });
  });

  it('only loads the library when it can change something', () => {
    expect(needsModeration([post()], viewer())).toBe(false);
    expect(needsModeration([post({ labels: ['porn'] })], viewer())).toBe(true);
    expect(needsModeration([post()], viewer({ mutedUserIds: new Set(['x']) }))).toBe(true);
  });
});

describe('label vocabulary drift', () => {
  it('SELF_LABELS equals the SQL CHECK on community_posts.labels', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .filter((s) => /community_posts_labels_check\s+check/.test(s))
      .pop();
    expect(latest, 'no migration defines community_posts_labels_check').toBeDefined();
    const m = latest!.match(/labels <@ array\[([^\]]+)\]/);
    const sqlValues = m![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect([...sqlValues].sort()).toEqual([...SELF_LABELS].sort());
  });

  it('every SELF_LABEL is a Bluesky global label', () => {
    for (const l of SELF_LABELS) expect(atproto.LABELS[l]).toBeDefined();
  });
});
