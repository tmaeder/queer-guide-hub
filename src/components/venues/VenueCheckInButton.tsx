import { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVenueCheckins } from '@/hooks/useVenueCheckins';
import { useAuth } from '@/hooks/useAuth';

interface VenueCheckInButtonProps {
  venueId: string;
  venueName: string;
  venueLatitude: number | null;
  venueLongitude: number | null;
  onCheckInSuccess?: () => void;
}

export function VenueCheckInButton({ 
  venueId, 
  venueName, 
  venueLatitude, 
  venueLongitude,
  onCheckInSuccess 
}: VenueCheckInButtonProps) {
  const { checkInAtVenue, loading, MAX_CHECKIN_DISTANCE_METERS } = useVenueCheckins();
  const { user } = useAuth();

  if (!user) {
    return null; // Only show for authenticated users
  }

  if (!venueLatitude || !venueLongitude) {
    return null; // Only show if venue has coordinates
  }

  const handleCheckIn = async () => {
    const result = await checkInAtVenue(venueId, venueLatitude, venueLongitude);
    if (result.success && onCheckInSuccess) {
      onCheckInSuccess();
    }
  };

  return (
    <Button
      onClick={handleCheckIn}
      disabled={loading}
      className="flex items-center gap-2"
      variant="default"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <MapPin className="w-4 h-4" />
      )}
      {loading ? 'Checking location...' : 'Check In'}
    </Button>
  );
}