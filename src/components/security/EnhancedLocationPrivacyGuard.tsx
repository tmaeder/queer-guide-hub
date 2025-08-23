import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MapPin, Lock, AlertTriangle, Clock } from 'lucide-react';

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
    <div className="space-y-4">
      {showWarning && locationData && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Location data privacy controls are active. Precise location information
            may be hidden or anonymized based on your privacy settings and data age.
          </AlertDescription>
        </Alert>
      )}

      {isAnonymized && (
        <Card className="border-warning">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-warning">
              <Clock className="h-4 w-4" />
              <span className="text-sm">
                This location data has been automatically anonymized for privacy protection.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {user && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4" />
              Location Privacy Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="precise-location">Share Precise Location</Label>
                <p className="text-xs text-muted-foreground">
                  Allow sharing exact coordinates and full addresses
                </p>
              </div>
              <Switch
                id="precise-location"
                checked={locationSettings.location_precise}
                onCheckedChange={(checked) => 
                  updateLocationSettings({ location_precise: checked })
                }
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="region-only">Region Only</Label>
                <p className="text-xs text-muted-foreground">
                  Share only city/region, not specific addresses
                </p>
              </div>
              <Switch
                id="region-only"
                checked={locationSettings.location_region_only}
                onCheckedChange={(checked) => 
                  updateLocationSettings({ location_region_only: checked })
                }
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="auto-anonymize">Auto-Anonymize Old Data</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically anonymize location data older than 30 days
                </p>
              </div>
              <Switch
                id="auto-anonymize"
                checked={locationSettings.auto_anonymize}
                onCheckedChange={(checked) => 
                  updateLocationSettings({ auto_anonymize: checked })
                }
                disabled={loading}
              />
            </div>

            <Button 
              onClick={triggerLocationAnonymization}
              variant="outline" 
              size="sm"
              disabled={loading}
              className="w-full"
            >
              <Lock className="h-3 w-3 mr-2" />
              Anonymize All Old Location Data Now
            </Button>
          </CardContent>
        </Card>
      )}

      {!allowPreciseLocation && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Precise location hidden for privacy
        </div>
      )}

      {React.cloneElement(children as React.ReactElement, {
        location: privacyLocation
      })}
    </div>
  );
}