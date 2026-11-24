import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export type Profile = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  pronouns?: string | null;
  age_range?: string | null;
  verified_identity?: boolean | null;
  user_mode?: string | null;
  is_business?: boolean | null;
  bio?: string | null;
  location?: string | null;
  occupation?: string | null;
  education?: string | null;
  created_at?: string | null;
  last_active_at?: string | null;
  gender_identity?: string | null;
  website?: string | null;
  interests?: string[] | null;
};

export interface UserFilters {
  searchQuery: string;
  location: string;
  ageRange: string;
  occupation: string;
  education: string;
  interests: string[];
  genderIdentity: string;
  isVerified: boolean;
  isBusiness: boolean;
  sortBy: 'newest' | 'oldest' | 'alphabetical' | 'last_active' | 'match';
}

export const defaultUserFilters: UserFilters = {
  searchQuery: '',
  location: '',
  ageRange: 'all',
  occupation: '',
  education: 'all',
  interests: [],
  genderIdentity: 'all',
  isVerified: false,
  isBusiness: false,
  sortBy: 'newest',
};

export const ageRanges = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
export const educationLevels = [
  'High School',
  'Some College',
  "Bachelor's",
  "Master's",
  'PhD',
  'Trade School',
];
export const genderIdentities = ['Man', 'Woman', 'Non-binary', 'Genderfluid', 'Agender', 'Other'];
export const commonInterests = [
  'Technology',
  'Art',
  'Music',
  'Sports',
  'Travel',
  'Food',
  'Books',
  'Movies',
  'Gaming',
  'Fitness',
  'Photography',
  'Nature',
  'Fashion',
  'Science',
];

interface UseUserDirectoryQueryArgs {
  filters: UserFilters;
  nearMe: boolean;
  userLocation: { latitude: number; longitude: number } | null;
}

export const PROFILE_PAGE_SIZE = 60;

/**
 * Columns a signed-out visitor may read. `anon` holds a column-level SELECT grant on
 * `profiles` covering exactly this set (plus the presence columns `profile_status_v`
 * needs), so `select('*')` here would fail with `permission denied for table profiles`.
 *
 * `bio` and `location` are not rendered on the anon card — they back the search `.or()`
 * below, which is visible signed-out. Everything else the grid shows for anon is here;
 * the rest of the card sits behind `isAuthed` in UserDirectoryGrid.
 */
export const ANON_DIRECTORY_COLS =
  'user_id, display_name, avatar_url, bio, location, website, user_mode, is_business, verified_identity, created_at, last_active_at';

/**
 * The anon set plus the fields the signed-in card renders and its filter panel queries.
 *
 * Spelled out in full rather than composed as `${ANON_DIRECTORY_COLS}, ...`: postgrest-js
 * parses the select list at the TYPE level, and a template-literal type defeats that
 * parser — it degrades the result to `ParserError[]`, which then fails the `as Profile[]`
 * cast below. Keep both as plain literals.
 */
export const AUTHED_DIRECTORY_COLS =
  'user_id, display_name, avatar_url, bio, location, website, user_mode, is_business, verified_identity, created_at, last_active_at, pronouns, age_range, occupation, education, gender_identity, interests';

export function useUserDirectoryQuery({
  filters,
  nearMe,
  userLocation,
}: UseUserDirectoryQueryArgs) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-directory', filters, nearMe, userLocation, user?.id],
    queryFn: async () => {
      // postgrest-js parses the select list at the TYPE level, and it cannot parse a
      // *union* of two literals — passing `user ? AUTHED : ANON` directly degrades the
      // result to `ParserError[]`. Pinning the parameter to the anon literal keeps the
      // inference working and is the honest description of the contract: the anon columns
      // are the guaranteed subset, and a signed-in caller gets strictly more.
      const columns = (
        user ? AUTHED_DIRECTORY_COLS : ANON_DIRECTORY_COLS
      ) as typeof ANON_DIRECTORY_COLS;
      let query = supabase.from('profiles').select(columns).limit(PROFILE_PAGE_SIZE);

      if (filters.searchQuery) {
        const escaped = filters.searchQuery.replace(/[,()]/g, ' ').trim();
        if (escaped) {
          query = query.or(
            `display_name.ilike.%${escaped}%,bio.ilike.%${escaped}%,location.ilike.%${escaped}%`,
          );
        }
      }

      if (filters.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }

      if (filters.ageRange && filters.ageRange !== 'all') {
        query = query.eq('age_range', filters.ageRange);
      }

      if (filters.occupation) {
        query = query.ilike('occupation', `%${filters.occupation}%`);
      }

      if (filters.education && filters.education !== 'all') {
        query = query.eq('education', filters.education);
      }

      if (filters.genderIdentity && filters.genderIdentity !== 'all') {
        query = query.eq('gender_identity', filters.genderIdentity);
      }

      if (filters.isBusiness) {
        query = query.eq('is_business', true);
      }

      if (filters.isVerified) {
        query = query.eq('verified_identity', true);
      }

      switch (filters.sortBy) {
        case 'oldest':
          query = query.order('created_at', { ascending: true, nullsFirst: false });
          break;
        case 'alphabetical':
          query = query.order('display_name', { ascending: true, nullsFirst: false });
          break;
        case 'last_active':
        case 'match':
          // 'match' fetches a recent base set, then re-orders by compatibility
          // below (the RPC ranking is applied post-fetch so all filters hold).
          query = query.order('last_active_at', { ascending: false, nullsFirst: false });
          break;
        default:
          query = query.order('created_at', { ascending: false, nullsFirst: false });
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Profile fetch error:', error);
        throw new Error(`Failed to load profiles: ${error.message}`);
      }

      let filteredData = (data ?? []) as Profile[];

      // Private members are hidden by RLS but still show a basic card to other
      // signed-in members (member_cards: name, avatar, mode, join date only).
      // Those cards carry none of the attribute filters' fields, so they join
      // only when no attribute filter is active.
      const attributeFilterActive =
        !!filters.location ||
        (filters.ageRange && filters.ageRange !== 'all') ||
        !!filters.occupation ||
        (filters.education && filters.education !== 'all') ||
        (filters.genderIdentity && filters.genderIdentity !== 'all') ||
        filters.isBusiness ||
        filters.isVerified ||
        filters.interests.length > 0 ||
        nearMe;
      if (user && !attributeFilterActive) {
        const { data: cards, error: cardsError } = await untypedRpc<Partial<Profile>[]>(
          'member_cards',
          {
            p_search: filters.searchQuery || undefined,
            p_limit: PROFILE_PAGE_SIZE,
          },
        );
        if (!cardsError && cards) {
          const seen = new Set(filteredData.map((p) => p.user_id));
          const extra = cards.filter((c) => !seen.has(c.user_id!));
          filteredData = [...filteredData, ...(extra as Profile[])];
          const byCreated = (a: Profile, b: Profile) =>
            String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
          if (filters.sortBy === 'oldest') filteredData.sort((a, b) => byCreated(b, a));
          else if (filters.sortBy === 'alphabetical')
            filteredData.sort((a, b) =>
              String(a.display_name ?? '').localeCompare(String(b.display_name ?? '')),
            );
          else if (filters.sortBy !== 'last_active' && filters.sortBy !== 'match')
            filteredData.sort(byCreated);
        }
      }
      if (filters.interests.length > 0) {
        filteredData = filteredData.filter((profile) => {
          const profileInterests = (profile.interests as string[]) || [];
          return filters.interests.some((interest) =>
            profileInterests.some((profileInterest) =>
              profileInterest.toLowerCase().includes(interest.toLowerCase()),
            ),
          );
        });
      }

      if (nearMe && userLocation) {
        try {
          const { data: geo, error: geoError } = await supabase.functions.invoke(
            'mapbox-geocoding',
            {
              body: {
                query: `${userLocation.longitude},${userLocation.latitude}`,
                isReverseGeocode: true,
              },
            },
          );

          if (!geoError && geo?.features?.[0]?.place_name) {
            const cityParts = (geo.features[0].place_name as string)
              .split(',')
              .map((part) => part.trim().toLowerCase())
              .filter((part) => part.length > 2);

            filteredData = filteredData.filter((profile) => {
              if (!profile.location) return false;
              const profileLocation = profile.location.toLowerCase();
              return cityParts.some((cityPart) => profileLocation.includes(cityPart));
            });
          }
        } catch (error) {
          console.error('Error getting user city for near me filter:', error);
        }
      }

      // Compatibility sort: re-order the already-filtered set by the shared
      // people-matching engine. Signed-in only; profiles the engine doesn't
      // rank (e.g. not discoverable) fall to the end in their existing order.
      if (filters.sortBy === 'match' && user) {
        const { data: ranked, error: rankError } = await supabase.rpc('people_discovery', {
          p_viewer: user.id,
          p_mode: 'locals',
          p_limit: 300,
        });
        if (!rankError && ranked) {
          const rankIndex = new Map<string, number>(
            (ranked as { user_id: string }[]).map((r, i) => [r.user_id, i]),
          );
          const at = (id: string) => rankIndex.get(id) ?? Number.MAX_SAFE_INTEGER;
          filteredData = [...filteredData].sort((a, b) => at(a.user_id) - at(b.user_id));
        }
      }

      return filteredData;
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 30_000,
  });
}
