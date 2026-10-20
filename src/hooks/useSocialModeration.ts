import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  decide,
  loadAtproto,
  needsModeration,
  pendingModeration,
  type LabelPreference,
  type ModeratablePost,
  type MutedWord,
  type PostModeration,
  type SelfLabel,
  type ViewerModeration,
} from '@/lib/atprotoModeration';

const KEY = ['social-moderation'];

interface ModerationState {
  mutedUserIds: string[];
  mutedWords: Array<MutedWord & { id: string }>;
  adultContentEnabled: boolean;
  labelPrefs: Partial<Record<SelfLabel, LabelPreference>>;
}

const EMPTY: ModerationState = {
  mutedUserIds: [],
  mutedWords: [],
  adultContentEnabled: false,
  labelPrefs: {},
};

/** The viewer's mutes, muted words and label prefs (Bluesky semantics). */
export function useSocialModeration() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [...KEY, user?.id ?? null],
    enabled: !!user,
    queryFn: async (): Promise<ModerationState> => {
      const [mutes, words, prefs] = await Promise.all([
        supabase.from('user_mutes').select('muted_id'),
        supabase.from('user_muted_words').select('id, value, targets, actor_target, expires_at'),
        supabase
          .from('user_moderation_prefs')
          .select('adult_content_enabled, label_prefs')
          .maybeSingle(),
      ]);
      if (mutes.error) throw mutes.error;
      if (words.error) throw words.error;
      if (prefs.error) throw prefs.error;
      const now = Date.now();
      return {
        mutedUserIds: (mutes.data ?? []).map((m) => m.muted_id),
        mutedWords: (words.data ?? [])
          .filter((w) => !w.expires_at || new Date(w.expires_at).getTime() > now)
          .map((w) => ({
            id: w.id,
            value: w.value,
            targets: w.targets,
            actorTarget: w.actor_target,
            expiresAt: w.expires_at ?? undefined,
          })),
        adultContentEnabled: prefs.data?.adult_content_enabled ?? false,
        labelPrefs: (prefs.data?.label_prefs ?? {}) as ModerationState['labelPrefs'],
      };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  const need = () => {
    if (!user) throw new Error('Sign in first');
    return user.id;
  };

  const mute = useMutation({
    mutationFn: async (mutedId: string) => {
      const { error } = await supabase
        .from('user_mutes')
        .insert({ muter_id: need(), muted_id: mutedId });
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: invalidate,
  });
  const unmute = useMutation({
    mutationFn: async (mutedId: string) => {
      const { error } = await supabase
        .from('user_mutes')
        .delete()
        .eq('muter_id', need())
        .eq('muted_id', mutedId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const addMutedWord = useMutation({
    mutationFn: async (w: {
      value: string;
      targets?: string[];
      actorTarget?: string;
      expiresAt?: string | null;
    }) => {
      const { error } = await supabase.from('user_muted_words').insert({
        user_id: need(),
        value: w.value.trim(),
        targets: w.targets ?? ['content', 'tag'],
        actor_target: w.actorTarget ?? 'all',
        expires_at: w.expiresAt ?? null,
      });
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: invalidate,
  });
  const removeMutedWord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_muted_words').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const savePrefs = useMutation({
    mutationFn: async (p: {
      adultContentEnabled: boolean;
      labelPrefs: ModerationState['labelPrefs'];
    }) => {
      const { error } = await supabase.from('user_moderation_prefs').upsert({
        user_id: need(),
        adult_content_enabled: p.adultContentEnabled,
        label_prefs: p.labelPrefs,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const state = query.data ?? EMPTY;
  return {
    ...state,
    isLoading: query.isLoading,
    mute,
    unmute,
    addMutedWord,
    removeMutedWord,
    savePrefs,
  };
}

/**
 * Per-post Bluesky moderation decisions. Loads @atproto/api only when a post is
 * labelled or the viewer has mutes; meanwhile labelled posts are blurred.
 */
export function usePostModeration(posts: ModeratablePost[]): Map<string, PostModeration> {
  const { user } = useAuth();
  const m = useSocialModeration();
  const viewer: ViewerModeration = useMemo(
    () => ({
      userId: user?.id,
      mutedUserIds: new Set(m.mutedUserIds),
      mutedWords: m.mutedWords,
      adultContentEnabled: m.adultContentEnabled,
      labelPrefs: m.labelPrefs,
    }),
    [user?.id, m.mutedUserIds, m.mutedWords, m.adultContentEnabled, m.labelPrefs],
  );
  const needed = needsModeration(posts, viewer);
  const [mod, setMod] = useState<Awaited<ReturnType<typeof loadAtproto>> | null>(null);

  useEffect(() => {
    if (!needed || mod) return;
    let live = true;
    loadAtproto().then((x) => live && setMod(x));
    return () => {
      live = false;
    };
  }, [needed, mod]);

  return useMemo(() => {
    const out = new Map<string, PostModeration>();
    if (!needed) return out;
    for (const p of posts) out.set(p.id, mod ? decide(mod, p, viewer) : pendingModeration(p));
    return out;
  }, [posts, viewer, needed, mod]);
}

/** Display names for the accounts the viewer muted (Settings → Moderation list). */
export function useMutedProfiles(ids: string[]) {
  return useQuery({
    queryKey: ['muted-profiles', [...ids].sort().join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', ids);
      if (error) throw error;
      return data ?? [];
    },
  });
}
