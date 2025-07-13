import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: number;
  class?: string;
}

export interface HotelSearchParams {
  location: string;
  checkInDate: string;
  checkOutDate: string;
  rooms: number;
  guests: number;
}

export interface Flight {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  price: number;
  currency: string;
  airline: string;
  flightNumber?: string;
  duration?: number;
  stops: number;
  link?: string;
}

export interface Hotel {
  id: string;
  name: string;
  location: string;
  address: string;
  rating: number;
  reviewScore?: number;
  price: number;
  currency: string;
  amenities: string[];
  photos: string[];
  description?: string;
}

export interface BookingData {
  bookingType: 'flight' | 'hotel';
  totalPrice: number;
  currency: string;
  travelerDetails: any;
  
  // Flight specific
  flightData?: any;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDate?: string;
  returnDate?: string;
  passengers?: number;
  
  // Hotel specific
  hotelData?: any;
  hotelName?: string;
  hotelLocation?: string;
  checkInDate?: string;
  checkOutDate?: string;
  rooms?: number;
  guests?: number;
}

export function useBookings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Search flights
  const searchFlights = async (params: FlightSearchParams): Promise<{ flights: Flight[]; searchParams: FlightSearchParams }> => {
    const { data, error } = await supabase.functions.invoke('search-flights', {
      body: params
    });

    if (error) {
      throw new Error(error.message || 'Failed to search flights');
    }

    if (!data.success) {
      throw new Error(data.error || 'Failed to search flights');
    }

    return data;
  };

  // Search hotels
  const searchHotels = async (params: HotelSearchParams): Promise<{ hotels: Hotel[]; searchParams: HotelSearchParams }> => {
    const { data, error } = await supabase.functions.invoke('search-hotels', {
      body: params
    });

    if (error) {
      throw new Error(error.message || 'Failed to search hotels');
    }

    if (!data.success) {
      throw new Error(data.error || 'Failed to search hotels');
    }

    return data;
  };

  // Create booking
  const createBookingMutation = useMutation({
    mutationFn: async (bookingData: BookingData) => {
      const { data, error } = await supabase.functions.invoke('create-booking', {
        body: bookingData
      });

      if (error) {
        throw new Error(error.message || 'Failed to create booking');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to create booking');
      }

      return data.booking;
    },
    onSuccess: () => {
      toast({
        title: "Booking Created",
        description: "Your booking has been created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Booking Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get user bookings
  const { data: bookings, isLoading: isLoadingBookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
  });

  // Update booking status
  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Booking Updated",
        description: "Booking status has been updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    searchFlights,
    searchHotels,
    createBooking: createBookingMutation.mutate,
    isCreatingBooking: createBookingMutation.isPending,
    bookings,
    isLoadingBookings,
    updateBooking: updateBookingMutation.mutate,
    isUpdatingBooking: updateBookingMutation.isPending,
  };
}