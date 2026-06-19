import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, profileQueryKey, type Profile } from '@/hooks/useProfile';

// Followed news topics (category- or tag-slugs). localStorage is the source of
// truth so anonymous users get full functionality with zero round-trips. For
// signed-in users we best-effort mirror into profiles.preferences.news.
// followed_topics (jsonb) for cross-device durability, and on sign-in we UNION
// the local + profile sets so a topic followed while logged out survives login.
//
// No dedicated table — see the redesign plan: a small string-set doesn't need
// one, and ranking happens client-side.

const STORAGE_KEY = 'qg:news:followed-topics';

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocal(slugs: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    /* ignore quota/SSR */
  }
}

function readProfileTopics(profile: Profile | null): string[] {
  const prefs = (profile?.preferences as Record<string, unknown> | null) ?? null;
  const news = (prefs?.news as Record<string, unknown> | undefined) ?? undefined;
  const arr = news?.followed_topics;
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
}

export function useFollowedTopics() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [followed, setFollowed] = useState<string[]>(() => readLocal());
  const mergedFromProfileRef = useRef(false);

  // Persist to profiles.preferences.news.followed_topics without an extra fetch
  // (read the cached profile, merge, write back), mirroring useCurrency.
  const persistToProfile = useCallback(
    (slugs: string[]) => {
      if (!user) return;
      const cached = queryClient.getQueryData<Profile | null>(profileQueryKey(user.id));
      const prefs = (cached?.preferences as Record<string, unknown> | null) ?? {};
      const news = (prefs.news as Record<string, unknown> | undefined) ?? {};
      const nextPrefs = { ...prefs, news: { ...news, followed_topics: slugs } };
      void supabase
        .from('profiles')
        .update({ preferences: nextPrefs })
        .eq('user_id', user.id)
        .then(() => {
          if (cached) {
            queryClient.setQueryData<Profile | null>(profileQueryKey(user.id), {
              ...cached,
              preferences: nextPrefs as Profile['preferences'],
            });
          }
        });
    },
    [user, queryClient],
  );

  // On first profile load after sign-in, union local + profile follows.
  useEffect(() => {
    if (!user || !profile || mergedFromProfileRef.current) return;
    mergedFromProfileRef.current = true;
    const fromProfile = readProfileTopics(profile);
    const local = readLocal();
    const union = Array.from(new Set([...local, ...fromProfile]));
    if (
      union.length !== local.length ||
      union.length !== fromProfile.length ||
      union.some((s) => !local.includes(s))
    ) {
      writeLocal(union);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local state with the merged server set on sign-in.
      setFollowed(union);
      if (union.length !== fromProfile.length || union.some((s) => !fromProfile.includes(s))) {
        persistToProfile(union);
      }
    }
  }, [user, profile, persistToProfile]);

  // Reset the merge guard on sign-out so a later sign-in re-unions.
  useEffect(() => {
    if (!user) mergedFromProfileRef.current = false;
  }, [user]);

  const commit = useCallback(
    (next: string[]) => {
      writeLocal(next);
      setFollowed(next);
      persistToProfile(next);
    },
    [persistToProfile],
  );

  const isFollowed = useCallback((slug: string) => followed.includes(slug), [followed]);

  const toggle = useCallback(
    (slug: string) => {
      commit(followed.includes(slug) ? followed.filter((s) => s !== slug) : [...followed, slug]);
    },
    [followed, commit],
  );

  const follow = useCallback(
    (slug: string) => {
      if (!followed.includes(slug)) commit([...followed, slug]);
    },
    [followed, commit],
  );

  const unfollow = useCallback(
    (slug: string) => {
      if (followed.includes(slug)) commit(followed.filter((s) => s !== slug));
    },
    [followed, commit],
  );

  const clear = useCallback(() => commit([]), [commit]);

  return { followed, isFollowed, toggle, follow, unfollow, clear };
}
