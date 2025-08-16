import React from 'react';
import { Shield, MapPin, Clock, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';

interface LocationPrivacyGuardProps {
  children: React.ReactNode;
  locationData?: {
    latitude?: number;
    longitude?: number;
    venue_name?: string;
    created_at?: string;
  };
  showWarning?: boolean;
  allowPreciseLocation?: boolean;
}

/**
 * LocationPrivacyGuard - Enhanced location privacy protection
 * Implements privacy-by-design for location data with user controls
 */
export function LocationPrivacyGuard({ 
  children, 
  locationData,
  showWarning = true,
  allowPreciseLocation = false
}: LocationPrivacyGuardProps) {
  const { user } = useAuth();

  // Check if location data is older than 30 days (anonymization threshold)
  const isLocationAnonymized = locationData?.created_at && 
    new Date(locationData.created_at) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Privacy-preserving location display
  const getPrivacyPreservingLocation = () => {
    if (!locationData) return null;

    // If location is anonymized or precise location not allowed, show city-level only
    if (isLocationAnonymized || !allowPreciseLocation) {
      return {
        ...locationData,
        latitude: undefined,
        longitude: undefined,
        venue_name: locationData.venue_name ? '[Location anonymized]' : undefined
      };
    }

    return locationData;
  };

  const privacyLocation = getPrivacyPreservingLocation();

  return (
    <div className="space-y-4">
      {showWarning && locationData && (
        <Alert className="border-warning">
          <Shield className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Location data is protected by privacy controls</span>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Auto-anonymized after 30 days</span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isLocationAnonymized && (
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location Privacy Protection Active
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This location data has been automatically anonymized for privacy protection.
            Only general area information is available.
          </CardContent>
        </Card>
      )}

      {React.cloneElement(children as React.ReactElement, {
        locationData: privacyLocation
      })}

      {locationData && !allowPreciseLocation && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Precise location coordinates are hidden for privacy
        </div>
      )}
    </div>
  );
}