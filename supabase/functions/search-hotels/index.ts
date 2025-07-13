import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      location,
      checkInDate,
      checkOutDate,
      rooms,
      guests
    } = await req.json();

    console.log('Searching hotels:', { location, checkInDate, checkOutDate, rooms, guests });

    // Return mock hotel data for demonstration
    const hotels = [
      {
        id: 'hotel-1',
        name: `Grand Plaza Hotel ${location}`,
        location: location,
        address: `123 Main Street, ${location}`,
        rating: 4,
        reviewScore: 8.5,
        price: 150,
        currency: 'USD',
        amenities: ['WiFi', 'Pool', 'Gym', 'Restaurant', 'Spa', 'Room Service'],
        photos: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400'],
        description: 'Luxury hotel in the heart of the city with stunning views and world-class amenities'
      },
      {
        id: 'hotel-2',
        name: `City Center Inn ${location}`,
        location: location,
        address: `456 Center Ave, ${location}`,
        rating: 3,
        reviewScore: 7.8,
        price: 85,
        currency: 'USD',
        amenities: ['WiFi', 'Breakfast', 'Parking', 'Gym'],
        photos: ['https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400'],
        description: 'Comfortable stay with modern amenities in a convenient location'
      },
      {
        id: 'hotel-3',
        name: `Budget Express ${location}`,
        location: location,
        address: `789 Budget St, ${location}`,
        rating: 2,
        reviewScore: 6.5,
        price: 45,
        currency: 'USD',
        amenities: ['WiFi', 'Parking'],
        photos: ['https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400'],
        description: 'Affordable accommodation for budget travelers'
      },
      {
        id: 'hotel-4',
        name: `Boutique Suites ${location}`,
        location: location,
        address: `321 Designer Blvd, ${location}`,
        rating: 5,
        reviewScore: 9.2,
        price: 280,
        currency: 'USD',
        amenities: ['WiFi', 'Pool', 'Spa', 'Restaurant', 'Concierge', 'Valet Parking'],
        photos: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400'],
        description: 'Elegant boutique hotel with personalized service and luxury accommodations'
      }
    ];

    console.log('Returning mock hotel data:', hotels.length, 'hotels');

    return new Response(
      JSON.stringify({ 
        success: true, 
        hotels,
        searchParams: { location, checkInDate, checkOutDate, rooms, guests }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Search hotels error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});