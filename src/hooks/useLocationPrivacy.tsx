import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface LocationSettings {
  preciseLocation: boolean;
  regionOnly: boolean;
  autoAnonymize: boolean;
  anonymizationDays: number;
}

interface LocationData {
  latitude?: number;
  longitude?: number;
  venue_name?: string;
  city?: string;
  country?: string;
  created_at?: string;
  anonymized_at?: string;
}

export function useLocationPrivacy() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [locationSettings, setLocationSettings] = useState<LocationSettings>({
    preciseLocation: false,
    regionOnly: true,
    autoAnonymize: true,
    anonymizationDays: 30
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchLocationSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchLocationSettings defined below, re-run on user change
  }, [user]);

  const fetchLocationSettings = async () => {
    if (!user) return;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('privacy_settings')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (profile?.privacy_settings) {
        const settings = profile.privacy_settings as Record<string, unknown>;
        setLocationSettings({
          preciseLocation: settings.location_public || false,
          regionOnly: !settings.location_public || true,
          autoAnonymize: settings.location_auto_anonymize !== false,
          anonymizationDays: settings.location_anonymization_days || 30
        });
      }
    } catch (error) {
      console.error('Error fetching location settings:', error);
    }
  };

  const updateLocationSettings = async (newSettings: Partial<LocationSettings>) => {
    if (!user) return;

    try {
      setLoading(true);
      const updatedSettings = { ...locationSettings, ...newSettings };

      // Get current privacy settings to preserve other settings
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('privacy_settings')
        .eq('user_id', user.id)
        .single();

      const currentSettings = (currentProfile?.privacy_settings as Record<string, unknown>) || {};
      const updatedPrivacySettings = {
        ...currentSettings,
        location_public: updatedSettings.preciseLocation,
        location_auto_anonymize: updatedSettings.autoAnonymize,
        location_anonymization_days: updatedSettings.anonymizationDays
      };

      const { error } = await supabase
        .from('profiles')
        .update({
          privacy_settings: updatedPrivacySettings
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setLocationSettings(updatedSettings);

      // Log the security event
      await supabase.rpc('log_sensitive_data_access', {
        p_user_id: user.id,
        p_target_user_id: user.id,
        p_data_type: 'location_settings',
        p_access_method: 'settings_update'
      });

      toast({
        title: "Location Privacy Updated",
        description: "Your location privacy settings have been saved.",
        variant: "default"
      });
    } catch (error) {
      console.error('Error updating location settings:', error);
      toast({
        title: "Error",
        description: "Failed to update location privacy settings.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getPrivacyPreservingLocation = useCallback((locationData: LocationData): LocationData => {
    if (!locationData) return {};

    const isAnonymized = locationData.anonymized_at || 
      (locationData.created_at && 
       new Date(locationData.created_at) < new Date(Date.now() - locationSettings.anonymizationDays * 24 * 60 * 60 * 1000));

    // If location should be anonymized or settings don't allow precise location
    if (isAnonymized || !locationSettings.preciseLocation) {
      return {
        ...locationData,
        latitude: locationData.latitude ? Math.round(locationData.latitude * 10) / 10 : undefined,
        longitude: locationData.longitude ? Math.round(locationData.longitude * 10) / 10 : undefined,
        venue_name: locationSettings.regionOnly ? undefined : locationData.venue_name,
        city: locationData.city,
        country: locationData.country
      };
    }

    // Return full data if user allows precise location
    return locationData;
  }, [locationSettings]);

  const isLocationAnonymized = useCallback((createdAt: string): boolean => {
    const cutoffDate = new Date(Date.now() - locationSettings.anonymizationDays * 24 * 60 * 60 * 1000);
    return new Date(createdAt) < cutoffDate;
  }, [locationSettings.anonymizationDays]);

  const triggerLocationAnonymization = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { error } = await supabase.rpc('anonymize_location_data');
      
      if (error) throw error;

      toast({
        title: "Location Data Anonymized",
        description: "Your old location data has been anonymized for privacy protection.",
        variant: "default"
      });
    } catch (error) {
      console.error('Error anonymizing location data:', error);
      toast({
        title: "Error",
        description: "Failed to anonymize location data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    locationSettings,
    updateLocationSettings,
    getPrivacyPreservingLocation,
    isLocationAnonymized,
    triggerLocationAnonymization,
    loading
  };
}