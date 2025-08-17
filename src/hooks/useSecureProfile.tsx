import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface SecureProfileData {
  user_id: string;
  display_name?: string;
  avatar_url?: string;
  location?: string;
  bio?: string;
  pronouns?: string;
  phone?: string;
  sexual_orientation?: string;
  gender_identity?: string;
  relationship_status?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  income_range?: string;
  political_views?: string;
  religious_beliefs?: string;
  privacy_settings?: any;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export function useSecureProfile(targetUserId?: string) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SecureProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSecureProfile = async (userId?: string) => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use the secure profile function to get properly decrypted and privacy-controlled data
      const { data, error } = await supabase.rpc('get_secure_profile_data', {
        target_user_id: userId || user.id
      });

      if (error) {
        console.error('Error fetching secure profile:', error);
        setError(error.message);
        return;
      }

      if (data && Array.isArray(data) && data.length > 0) {
        setProfile(data[0] as SecureProfileData);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Unexpected error fetching secure profile:', err);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const updateSecureProfile = async (updates: Partial<SecureProfileData>) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to update your profile",
        variant: "destructive"
      });
      return;
    }

    try {
      // Rate limiting check
      const rateLimitCheck = await supabase.rpc('check_rate_limit_enhanced', {
        identifier: user.id,
        max_attempts: 10,
        time_window_minutes: 60,
        action_type: 'profile_update'
      });

      if (!rateLimitCheck.data) {
        toast({
          title: "Rate limit exceeded",
          description: "Too many profile updates. Please try again later.",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating profile:', error);
        toast({
          title: "Update failed",
          description: error.message,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully",
      });

      // Refresh the profile data
      await fetchSecureProfile(targetUserId);
    } catch (err) {
      console.error('Unexpected error updating profile:', err);
      toast({
        title: "Update failed",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  const canViewSensitiveField = (fieldName: string) => {
    if (!profile || !user) return false;
    
    // Users can always see their own data
    if (profile.user_id === user.id) return true;
    
    // Check privacy settings
    const privacyField = `${fieldName}_public`;
    return profile.privacy_settings?.[privacyField] === true;
  };

  useEffect(() => {
    fetchSecureProfile(targetUserId);
  }, [user, targetUserId]);

  return {
    profile,
    loading,
    error,
    updateSecureProfile,
    canViewSensitiveField,
    refetchProfile: () => fetchSecureProfile(targetUserId)
  };
}