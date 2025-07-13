import { useState } from 'react';
import { format } from 'date-fns';
import { User, Mail, Phone, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useBookings, type Flight, type Hotel } from '@/hooks/useBookings';

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingType: 'flight' | 'hotel';
  itemData: Flight | Hotel;
  searchParams: any;
}

export function BookingDialog({ 
  open, 
  onOpenChange, 
  bookingType, 
  itemData, 
  searchParams 
}: BookingDialogProps) {
  const [travelerDetails, setTravelerDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialRequests: ''
  });

  const { createBooking, isCreatingBooking } = useBookings();

  const calculateTotal = () => {
    const basePrice = itemData.price;
    let multiplier = 1;
    
    if (bookingType === 'flight') {
      multiplier = searchParams.passengers || 1;
    } else if (bookingType === 'hotel') {
      const checkIn = new Date(searchParams.checkInDate);
      const checkOut = new Date(searchParams.checkOutDate);
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      multiplier = nights * (searchParams.rooms || 1);
    }
    
    return basePrice * multiplier;
  };

  const handleBooking = async () => {
    const bookingData = {
      bookingType,
      totalPrice: calculateTotal(),
      currency: itemData.currency,
      travelerDetails,
    };

    if (bookingType === 'flight') {
      const flight = itemData as Flight;
      Object.assign(bookingData, {
        flightData: flight,
        departureAirport: flight.origin,
        arrivalAirport: flight.destination,
        departureDate: flight.departureDate,
        returnDate: flight.returnDate,
        passengers: searchParams.passengers,
      });
    } else {
      const hotel = itemData as Hotel;
      Object.assign(bookingData, {
        hotelData: hotel,
        hotelName: hotel.name,
        hotelLocation: hotel.location,
        checkInDate: searchParams.checkInDate,
        checkOutDate: searchParams.checkOutDate,
        rooms: searchParams.rooms,
        guests: searchParams.guests,
      });
    }

    createBooking(bookingData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Book {bookingType === 'flight' ? 'Flight' : 'Hotel'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Booking Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Booking Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bookingType === 'flight' ? (
                <div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Route:</span>
                    <span>{(itemData as Flight).origin} → {(itemData as Flight).destination}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Departure:</span>
                    <span>{format(new Date((itemData as Flight).departureDate), 'MMM dd, yyyy')}</span>
                  </div>
                  {(itemData as Flight).returnDate && (
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Return:</span>
                      <span>{format(new Date((itemData as Flight).returnDate), 'MMM dd, yyyy')}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Passengers:</span>
                    <span>{searchParams.passengers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Airline:</span>
                    <span>{(itemData as Flight).airline}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Hotel:</span>
                    <span>{(itemData as Hotel).name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Location:</span>
                    <span>{(itemData as Hotel).location}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Check-in:</span>
                    <span>{format(new Date(searchParams.checkInDate), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Check-out:</span>
                    <span>{format(new Date(searchParams.checkOutDate), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Rooms:</span>
                    <span>{searchParams.rooms}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Guests:</span>
                    <span>{searchParams.guests}</span>
                  </div>
                </div>
              )}
              
              <Separator />
              
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total:</span>
                <span>{itemData.currency} {calculateTotal()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Traveler Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Traveler Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={travelerDetails.firstName}
                    onChange={(e) => setTravelerDetails(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Enter first name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={travelerDetails.lastName}
                    onChange={(e) => setTravelerDetails(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Enter last name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-10"
                    value={travelerDetails.email}
                    onChange={(e) => setTravelerDetails(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email address"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    className="pl-10"
                    value={travelerDetails.phone}
                    onChange={(e) => setTravelerDetails(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter phone number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialRequests">Special Requests (Optional)</Label>
                <Textarea
                  id="specialRequests"
                  value={travelerDetails.specialRequests}
                  onChange={(e) => setTravelerDetails(prev => ({ ...prev, specialRequests: e.target.value }))}
                  placeholder="Any special requests or requirements..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBooking}
              disabled={isCreatingBooking || !travelerDetails.firstName || !travelerDetails.lastName || !travelerDetails.email}
            >
              {isCreatingBooking ? 'Booking...' : `Book ${bookingType === 'flight' ? 'Flight' : 'Hotel'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}