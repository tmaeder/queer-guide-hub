import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  relationship_status?: string | null;
  has_children?: boolean | null;
  has_pets?: boolean | null;
  gender_identity?: string | null;
  website?: string | null;
  interests?: string[] | null;
};

export interface UserFilters {
  searchQuery: string;
  location: string;
  ageRange: string;
  relationshipStatus: string;
  occupation: string;
  education: string;
  interests: string[];
  genderIdentity: string;
  isVerified: boolean;
  isBusiness: boolean;
  hasChildren: boolean;
  hasPets: boolean;
  sortBy: 'newest' | 'oldest' | 'alphabetical' | 'last_active' | 'match';
}

export const defaultUserFilters: UserFilters = {
  searchQuery: '',
  location: '',
  ageRange: 'all',
  relationshipStatus: 'all',
  occupation: '',
  education: 'all',
  interests: [],
  genderIdentity: 'all',
  isVerified: false,
  isBusiness: false,
  hasChildren: false,
  hasPets: false,
  sortBy: 'newest',
};

export const ageRanges = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
export const relationshipStatuses = [
  'Single',
  'In a relationship',
  'Married',
  'Divorced',
  'Widowed',
  "It's complicated",
];
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

export function useUserDirectoryQuery({
  filters,
  nearMe,
  userLocation,
}: UseUserDirectoryQueryArgs) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-directory', filters, nearMe, userLocation, user?.id],
    queryFn: async () => {
      let query = supabase.from('profiles').select('*').limit(PROFILE_PAGE_SIZE);

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

      if (filters.relationshipStatus && filters.relationshipStatus !== 'all') {
        query = query.eq('relationship_status', filters.relationshipStatus);
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

      if (filters.hasChildren) {
        query = query.eq('has_children', true);
      }

      if (filters.hasPets) {
        query = query.eq('has_pets', true);
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
