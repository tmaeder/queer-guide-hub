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

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

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

  const checkInAtVenue = async (venueId: string, venueLat: number, venueLng: number) => {
    setLoading(true);
    
    try {
      // Get current location
      const position = await getCurrentLocation();
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      
      // Calculate distance between user and venue
      const distance = calculateDistance(userLat, userLng, venueLat, venueLng);
      
      // Check if user is within check-in radius
      if (distance > MAX_CHECKIN_DISTANCE_METERS) {
        toast({
          title: "Too far from venue",
          description: `You must be within ${MAX_CHECKIN_DISTANCE_METERS}m of the venue to check in. You are ${Math.round(distance)}m away.`,
          variant: "destructive"
        });
        return { success: false, distance };
      }

      // Create check-in record
      const { data, error } = await supabase
        .from('venue_checkins')
        .insert({
          venue_id: venueId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          latitude: userLat,
          longitude: userLng,
          distance_meters: distance
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Successfully checked in!",
        description: `You've checked in at this venue. Distance: ${Math.round(distance)}m`,
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
    // SECURITY: Only show anonymized venue statistics, no personal data
    // Users cannot see other users' check-ins for privacy protection
    const { data, error } = await supabase
      .from('venue_checkin_stats')
      .select('*')
      .eq('venue_id', venueId)
      .order('checkin_hour', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching venue statistics:', error);
      return [];
    }

    return data || [];
  };

  const getUserCheckins = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('venue_checkins')
      .select(`
        *,
        venues (
          name,
          address,
          city
        )
      `)
      .eq('user_id', user.id)
      .order('checked_in_at', { ascending: false });

    if (error) {
      console.error('Error fetching user check-ins:', error);
      return [];
    }

    return data || [];
  };

  return {
    checkInAtVenue,
    getVenueCheckins,
    getUserCheckins,
    loading,
    MAX_CHECKIN_DISTANCE_METERS
  };
}