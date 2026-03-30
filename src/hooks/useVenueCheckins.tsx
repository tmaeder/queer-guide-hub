import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type VenueCheckin = {
  id: string;
  venue_id: string;
  user_id: string;
  checked_in_at: string;
  latitude: number;
  longitude: number;
  distance_meters: number | null;
  created_at: string;
};

const MAX_CHECKIN_DISTANCE_METERS = 100; // 100 meters radius

export function useVenueCheckins() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const getCurrentLocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  };

  const checkInAtVenue = async (venueId: string, venueLat: number, venueLng: number, privacySettings = { isPublic: false, locationVisibility: 'private' }) => {
    setLoading(true);
    
    try {
      // Get current location
      const position = await getCurrentLocation();
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      
      // Use secure distance calculation without exposing coordinates
      const { data: distanceData, error: distanceError } = await supabase
        .rpc('calculate_secure_venue_distance', {
          venue_id: venueId,
          user_lat: userLat,
          user_lng: userLng
        });

      if (distanceError) throw distanceError;
      
      const distance = distanceData;
      
      // Check if user is within check-in radius
      if (distance > MAX_CHECKIN_DISTANCE_METERS) {
        toast({
          title: "Too far from venue",
          description: `You must be within ${MAX_CHECKIN_DISTANCE_METERS}m of the venue to check in. You are ${Math.round(distance)}m away.`,
          variant: "destructive"
        });
        return { success: false, distance };
      }

      // Create check-in record with enhanced privacy controls
      const { data, error } = await supabase
        .from('venue_checkins')
        .insert({
          venue_id: venueId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          latitude: userLat,
          longitude: userLng,
          distance_meters: distance,
          is_public: privacySettings.isPublic,
          location_visibility: privacySettings.locationVisibility,
          approximate_only: true,
          auto_anonymize_after: '24 hours'
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Successfully checked in!",
        description: `You've checked in at this venue. Your location data will be ${privacySettings.isPublic ? 'visible to friends' : 'kept private'}.`,
      });

      return { success: true, distance, checkin: data };
    } catch (error: any) {
      console.error('Check-in error:', error);
      
      if (error.code === 1) {
        toast({
          title: "Location permission denied",
          description: "Please allow location access to check in at venues.",
          variant: "destructive"
        });
      } else if (error.code === 3) {
        toast({
          title: "Location timeout",
          description: "Unable to get your location. Please try again.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Check-in failed",
          description: error.message || "Unable to check in. Please try again.",
          variant: "destructive"
        });
      }
      
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  };

  const getVenueCheckins = async (venueId: string) => {
    // SECURITY: Use secure function that applies proper privacy controls
    const { data, error } = await supabase
      .rpc('get_secure_venue_checkins', {
        venue_id: venueId
      });

    if (error) {
      console.error('Error fetching secure venue check-ins:', error);
      return [];
    }

    // Transform the secure data for compatibility
    const checkinArray = Array.isArray(data) ? data : [];
    return checkinArray.map((checkin: any) => ({
      id: checkin.id,
      venue_id: checkin.venue_id,
      user_id: checkin.user_id,
      checked_in_at: checkin.checked_in_at,
      location_data: checkin.location_data,
      distance_meters: checkin.distance_meters,
      is_public: checkin.is_public,
      can_view_precise_location: checkin.can_view_precise_location
    }));
  };

  const getUserCheckins = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Use secure function to get user's own check-ins with full access
    const { data, error } = await supabase
      .rpc('get_secure_venue_checkins', {
        venue_id: null // Get all venues
      });

    if (error) {
      console.error('Error fetching user check-ins:', error);
      return [];
    }

    // Get venue details for user's check-ins
    const checkinData = Array.isArray(data) ? data : [];
    const venueIds = [...new Set(checkinData.map((c: any) => c.venue_id))] as string[];
    
    if (venueIds.length === 0) return [];

    const { data: venues, error: venueError } = await supabase
      .from('venues')
      .select('id, name, address, city')
      .in('id', venueIds);

    if (venueError) {
      console.error('Error fetching venue details:', venueError);
      return checkinData;
    }

    // Merge venue data with check-ins
    return checkinData.map((checkin: any) => ({
      ...checkin,
      venues: venues?.find(v => v.id === checkin.venue_id) || null
    }));
  };

  return {
    checkInAtVenue,
    getVenueCheckins,
    getUserCheckins,
    loading,
    MAX_CHECKIN_DISTANCE_METERS
  };
}