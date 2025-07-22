import { useState } from 'react';
import { Plane, Hotel, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FlightSearch } from '@/components/booking/FlightSearch';
import { HotelSearch } from '@/components/booking/HotelSearch';
import { CarRentalSearch } from '@/components/booking/CarRentalSearch';

export default function Travel() {
  return (
    <div className="w-full px-4 py-8">
      <div className="w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-4">Travel Booking</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Find and book the best flights, hotels, and car rentals for your next adventure. 
            Compare prices from multiple providers and book with confidence.
          </p>
        </div>

        <Tabs defaultValue="flights" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="flights" className="flex items-center gap-2">
              <Plane className="h-4 w-4" />
              Flights
            </TabsTrigger>
            <TabsTrigger value="hotels" className="flex items-center gap-2">
              <Hotel className="h-4 w-4" />
              Hotels
            </TabsTrigger>
            <TabsTrigger value="cars" className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Car Rentals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="flights" className="mt-6">
            <FlightSearch />
          </TabsContent>

          <TabsContent value="hotels" className="mt-6">
            <HotelSearch />
          </TabsContent>

          <TabsContent value="cars" className="mt-6">
            <CarRentalSearch />
          </TabsContent>
        </Tabs>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Best Price Guarantee</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                We search hundreds of travel sites to find you the best deals on flights and hotels.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">24/7 Support</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Our customer support team is available around the clock to help with your bookings.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Secure Booking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your personal and payment information is protected with industry-standard encryption.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}