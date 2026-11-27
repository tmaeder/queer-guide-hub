import { useDatingMarks } from '@/hooks/useIntimateProfile';
import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePeopleDiscovery, type PeopleDiscoveryParams } from '@/hooks/usePeopleDiscovery';
import { useFriendProfilesQuery } from '@/hooks/useFriendProfiles';

/** One result lifecycle for ranked rails and grids, including profile hydration. */
export function usePeopleCards(params: PeopleDiscoveryParams) {
  const { user } = useAuth();
  const enabled = Boolean(user) && params.enabled !== false;
  const discovery = usePeopleDiscovery({ ...params, enabled });
  const matches = discovery.data;
  const ids = useMemo(() => matches?.map((match) => match.userId) ?? [], [matches]);
  const profiles = useFriendProfilesQuery(ids, enabled && ids.length > 0, user?.id);
  const { data: datingIds } = useDatingMarks(enabled ? ids : []);
  const cards = useMemo(() => {
    const byId = new Map(profiles.data?.map((profile) => [profile.user_id, profile]));
    // Rows that are no longer visible must not become nameless profile links.
    return (matches ?? []).flatMap((match) => {
      const profile = byId.get(match.userId);
      return profile
        ? [
            {
              userId: match.userId,
              displayName: profile.display_name,
              avatarUrl: profile.avatar_url,
              score: match.score,
              shared: match.shared,
              dating: !!datingIds?.has(match.userId),
            },
          ]
        : [];
    });
  }, [matches, profiles.data, datingIds]);

  return {
    cards: enabled ? cards : [],
    enabled,
    isLoading: enabled && (discovery.isLoading || (ids.length > 0 && profiles.isLoading)),
    isError: enabled && (discovery.isError || (ids.length > 0 && profiles.isError)),
    retry: () => {
      if (discovery.isError || !matches?.length) void discovery.refetch();
      else void profiles.refetch();
    },
  };
}
