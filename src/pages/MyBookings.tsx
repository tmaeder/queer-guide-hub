import { format } from 'date-fns';
import { Plane, Hotel, Calendar, MapPin, Users, Clock, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useBookings } from '@/hooks/useBookings';
import { useAuth } from '@/hooks/useAuth';

export default function MyBookings() {
  const { user } = useAuth();
  const { bookings, isLoadingBookings, updateBooking } = useBookings();

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>
            Please sign in to view your bookings.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoadingBookings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p>Loading your bookings...</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      case 'completed':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'failed':
        return 'destructive';
      case 'refunded':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-4">My Bookings</h1>
          <p className="text-lg text-muted-foreground">
            Manage your flight and hotel reservations
          </p>
        </div>

        {!bookings || bookings.length === 0 ? (
          <Alert>
            <AlertDescription>
              You don't have any bookings yet. Start planning your next trip!
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            {bookings.map((booking) => (
              <Card key={booking.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {booking.booking_type === 'flight' ? (
                        <Plane className="h-5 w-5" />
                      ) : (
                        <Hotel className="h-5 w-5" />
                      )}
                      {booking.booking_type === 'flight' ? 'Flight' : 'Hotel'} Booking
                    </CardTitle>
                    <div className="flex gap-2">
                      <Badge variant={getStatusColor(booking.status)}>
                        {booking.status}
                      </Badge>
                      <Badge variant={getPaymentStatusColor(booking.payment_status)}>
                        {booking.payment_status}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Booking Reference: {booking.booking_reference}
                  </p>
                </CardHeader>

                <CardContent className="space-y-4">
                  {booking.booking_type === 'flight' ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{booking.departure_airport}</span>
                        </div>
                        <Plane className="h-4 w-4 text-muted-foreground" />
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{booking.arrival_airport}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Departure</p>
                            <p className="text-muted-foreground">
                              {format(new Date(booking.departure_date!), 'MMM dd, yyyy')}
                            </p>
                          </div>
                        </div>

                        {booking.return_date && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">Return</p>
                              <p className="text-muted-foreground">
                                {format(new Date(booking.return_date), 'MMM dd, yyyy')}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Passengers</p>
                            <p className="text-muted-foreground">{booking.passengers}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Hotel className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{booking.hotel_name}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">{booking.hotel_location}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Check-in</p>
                            <p className="text-muted-foreground">
                              {format(new Date(booking.check_in_date!), 'MMM dd, yyyy')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Check-out</p>
                            <p className="text-muted-foreground">
                              {format(new Date(booking.check_out_date!), 'MMM dd, yyyy')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Guests</p>
                            <p className="text-muted-foreground">
                              {booking.guests} guests, {booking.rooms} room{booking.rooms! > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Total: {booking.currency} {booking.total_price}</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Booked {format(new Date(booking.created_at), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>

                  {booking.status === 'confirmed' && (
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => updateBooking({ id: booking.id, status: 'cancelled' })}
                      >
                        Cancel Booking
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}