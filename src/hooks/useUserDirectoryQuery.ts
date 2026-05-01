import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  sortBy: 'newest' | 'oldest' | 'alphabetical' | 'last_active';
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
  enabled: boolean;
}

export function useUserDirectoryQuery({
  filters,
  nearMe,
  userLocation,
  enabled,
}: UseUserDirectoryQueryArgs) {
  return useQuery({
    queryKey: ['user-directory', filters, nearMe, userLocation],
    enabled,
    queryFn: async () => {
      let query = supabase.from('profiles').select('*');

      if (filters.searchQuery) {
        query = query.or(
          `display_name.ilike.%${filters.searchQuery}%,bio.ilike.%${filters.searchQuery}%,location.ilike.%${filters.searchQuery}%`,
        );
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
          query = query.order('created_at', { ascending: true });
          break;
        case 'alphabetical':
          query = query.order('display_name', { ascending: true });
          break;
        case 'last_active':
          query = query.order('last_active_at', { ascending: false });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Profile fetch error:', error);
        throw new Error(`Failed to load profiles: ${error.message}`);
      }

      let filteredData = data as Profile[];
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
          const response = await fetch('/functions/v1/mapbox-geocoding', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `${userLocation.longitude},${userLocation.latitude}`,
              isReverseGeocode: true,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.features && data.features.length > 0) {
              const userCity = data.features[0].place_name;
              const cityParts = userCity.split(',').map((part) => part.trim().toLowerCase());

              filteredData = filteredData.filter((profile) => {
                if (!profile.location) return false;
                const profileLocation = profile.location.toLowerCase();
                return cityParts.some(
                  (cityPart) => profileLocation.includes(cityPart) && cityPart.length > 2,
                );
              });
            }
          }
        } catch (error) {
          console.error('Error getting user city for near me filter:', error);
        }
      }

      return filteredData;
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 30000,
  });
}
