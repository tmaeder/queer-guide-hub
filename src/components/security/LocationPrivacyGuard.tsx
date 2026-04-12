import React from 'react';
import { Shield, MapPin, Clock, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import Box from '@mui/material/Box';

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
  const { _user } = useAuth();

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {showWarning && locationData && (
        <Alert sx={{ borderColor: 'warning.main' }}>
          <Shield style={{ height: 16, width: 16 }} />
          <AlertDescription sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box component="span">Location data is protected by privacy controls</Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: 'text.secondary' }}>
              <Clock style={{ height: 12, width: 12 }} />
              <Box component="span">Auto-anonymized after 30 days</Box>
            </Box>
          </AlertDescription>
        </Alert>
      )}

      {isLocationAnonymized && (
        <Card sx={{ bgcolor: 'action.hover' }}>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin style={{ height: 16, width: 16 }} />
              Location Privacy Protection Active
            </CardTitle>
          </CardHeader>
          <CardContent sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            This location data has been automatically anonymized for privacy protection.
            Only general area information is available.
          </CardContent>
        </Card>
      )}

      {React.cloneElement(children as React.ReactElement, {
        locationData: privacyLocation
      })}

      {locationData && !allowPreciseLocation && (
        <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AlertTriangle style={{ height: 12, width: 12 }} />
          Precise location coordinates are hidden for privacy
        </Box>
      )}
    </Box>
  );
}