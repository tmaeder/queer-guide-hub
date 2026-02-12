import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MapPin, Lock, AlertTriangle, Clock } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface LocationPrivacyGuardProps {
  children: React.ReactNode;
  locationData?: {
    latitude?: number;
    longitude?: number;
    venue_name?: string;
    address?: string;
    created_at?: string;
  };
  showWarning?: boolean;
  allowPreciseLocation?: boolean;
}

export function EnhancedLocationPrivacyGuard({
  children,
  locationData,
  showWarning = false,
  allowPreciseLocation = false
}: LocationPrivacyGuardProps) {
  const { user } = useAuth();
  const [locationSettings, setLocationSettings] = useState({
    location_precise: false,
    location_region_only: true,
    auto_anonymize: true
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchLocationSettings();
    }
  }, [user]);

  const fetchLocationSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('privacy_settings')
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;

      const settings = data?.privacy_settings as any || {};
      setLocationSettings({
        location_precise: settings.location_precise || false,
        location_region_only: settings.location_region_only !== false,
        auto_anonymize: settings.auto_anonymize !== false
      });
    } catch (err) {
      console.error('Error fetching location settings:', err);
    }
  };

  const updateLocationSettings = async (newSettings: Partial<typeof locationSettings>) => {
    if (!user) return;

    try {
      setLoading(true);
      const updatedSettings = { ...locationSettings, ...newSettings };

      const { error } = await supabase
        .from('profiles')
        .update({
          privacy_settings: {
            ...locationSettings,
            ...updatedSettings
          }
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setLocationSettings(updatedSettings);

      // Log privacy settings change
      await supabase.rpc('log_security_event', {
        p_event_type: 'LOCATION_PRIVACY_SETTINGS_UPDATED',
        p_user_id: user.id,
        p_metadata: {
          new_settings: updatedSettings,
          timestamp: new Date().toISOString()
        },
        p_severity: 'medium'
      });

    } catch (err) {
      console.error('Error updating location settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const isLocationAnonymized = () => {
    if (!locationData?.created_at) return false;
    const createdAt = new Date(locationData.created_at);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return createdAt < thirtyDaysAgo;
  };

  const getPrivacyPreservingLocation = () => {
    if (!locationData) return null;

    const isAnonymized = isLocationAnonymized();
    const shouldShowPrecise = allowPreciseLocation && locationSettings.location_precise;

    return {
      ...locationData,
      latitude: shouldShowPrecise && !isAnonymized ? locationData.latitude : null,
      longitude: shouldShowPrecise && !isAnonymized ? locationData.longitude : null,
      venue_name: isAnonymized ? 'Location (Anonymized)' : locationData.venue_name,
      address: isAnonymized || !shouldShowPrecise
        ? locationData.address?.split(',').slice(-2).join(',') // City, Country only
        : locationData.address
    };
  };

  const triggerLocationAnonymization = async () => {
    try {
      setLoading(true);
      await supabase.rpc('anonymize_location_data');

      // Refresh location data if needed
      window.location.reload();
    } catch (err) {
      console.error('Error triggering location anonymization:', err);
    } finally {
      setLoading(false);
    }
  };

  const privacyLocation = getPrivacyPreservingLocation();
  const isAnonymized = isLocationAnonymized();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {showWarning && locationData && (
        <Alert>
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertDescription>
            Location data privacy controls are active. Precise location information
            may be hidden or anonymized based on your privacy settings and data age.
          </AlertDescription>
        </Alert>
      )}

      {isAnonymized && (
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.main' }}>
              <Clock style={{ height: 16, width: 16 }} />
              <Typography variant="body2">
                This location data has been automatically anonymized for privacy protection.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {user && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
                <MapPin style={{ height: 16, width: 16 }} />
                Location Privacy Controls
              </Box>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Label htmlFor="precise-location">Share Precise Location</Label>
                  <Typography variant="caption" color="text.secondary">
                    Allow sharing exact coordinates and full addresses
                  </Typography>
                </Box>
                <Switch
                  id="precise-location"
                  checked={locationSettings.location_precise}
                  onCheckedChange={(checked) =>
                    updateLocationSettings({ location_precise: checked })
                  }
                  disabled={loading}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Label htmlFor="region-only">Region Only</Label>
                  <Typography variant="caption" color="text.secondary">
                    Share only city/region, not specific addresses
                  </Typography>
                </Box>
                <Switch
                  id="region-only"
                  checked={locationSettings.location_region_only}
                  onCheckedChange={(checked) =>
                    updateLocationSettings({ location_region_only: checked })
                  }
                  disabled={loading}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Label htmlFor="auto-anonymize">Auto-Anonymize Old Data</Label>
                  <Typography variant="caption" color="text.secondary">
                    Automatically anonymize location data older than 30 days
                  </Typography>
                </Box>
                <Switch
                  id="auto-anonymize"
                  checked={locationSettings.auto_anonymize}
                  onCheckedChange={(checked) =>
                    updateLocationSettings({ auto_anonymize: checked })
                  }
                  disabled={loading}
                />
              </Box>

              <Button
                onClick={triggerLocationAnonymization}
                variant="outline"
                size="sm"
                disabled={loading}
                style={{ width: '100%' }}
              >
                <Lock style={{ height: 12, width: 12, marginRight: 8 }} />
                Anonymize All Old Location Data Now
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {!allowPreciseLocation && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
          <Lock style={{ height: 12, width: 12 }} />
          Precise location hidden for privacy
        </Box>
      )}

      {React.cloneElement(children as React.ReactElement, {
        location: privacyLocation
      })}
    </Box>
  );
}
