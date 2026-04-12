import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface PublicProfileData {
  id: string;
  user_id: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  created_at: string;
  is_business?: boolean;
  location?: string;
  pronouns?: string;
  website?: string;
  social_links?: Record<string, unknown>;
  interests?: string[];
  occupation?: string;
  education?: string;
  privacy_settings?: Record<string, unknown>;
  verified_identity?: boolean;
  age_range?: string;
  phone?: string;
  gender_identity?: string;
  sexual_orientation?: string;
  relationship_status?: string;
  income_range?: string;
}

export function useSecurePublicProfile(targetUserId?: string) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSecureProfile = async (userId?: string) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // If viewing own profile, get full data
      if (user?.id === userId) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching own profile:', error);
          setError(error.message);
          return;
        }

        setProfile(data as PublicProfileData);
        return;
      }

      // For public profiles, use the secure function
      const { data, error } = await supabase.rpc('get_public_profile_safe', {
        target_user_id: userId
      });

      if (error) {
        console.error('Error fetching public profile:', error);
        setError(error.message);
        return;
      }

      // If no data returned, user might not have public profile or doesn't exist
      if (!data) {
        setProfile(null);
        return;
      }

      setProfile(data as unknown as PublicProfileData);
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecureProfile(targetUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchSecureProfile defined above, re-run on user/targetUserId change
  }, [user, targetUserId]);

  const canViewSensitiveField = (fieldName: string) => {
    if (!profile || !user) return false;
    
    // Users can always see their own data
    if (profile.user_id === user.id) return true;
    
    // Check privacy settings for the specific field
    const privacyField = `${fieldName}_public`;
    return profile.privacy_settings?.[privacyField] === true;
  };

  return {
    profile,
    loading,
    error,
    canViewSensitiveField,
    refetchProfile: () => fetchSecureProfile(targetUserId),
    isOwnProfile: user?.id === targetUserId
  };
}