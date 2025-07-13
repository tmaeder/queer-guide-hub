import { useState } from 'react';
import { format } from 'date-fns';
import { Hotel as HotelIcon, Star, MapPin, Wifi, Utensils, Car, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type Hotel as HotelType, type HotelSearchParams } from '@/hooks/useBookings';
import { BookingDialog } from './BookingDialog';

interface HotelResultsProps {
  hotels: HotelType[];
  searchParams: HotelSearchParams;
}

const amenityIcons: Record<string, any> = {
  'WiFi': Wifi,
  'Restaurant': Utensils,
  'Parking': Car,
  'Gym': Dumbbell,
  'Pool': '🏊‍♂️',
  'Breakfast': '🍳',
};

export function HotelResults({ hotels, searchParams }: HotelResultsProps) {
  const [selectedHotel, setSelectedHotel] = useState<HotelType | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  const handleBookHotel = (hotel: HotelType) => {
    setSelectedHotel(hotel);
    setShowBookingDialog(true);
  };

  if (hotels.length === 0) {
    return (
      <Alert>
        <HotelIcon className="h-4 w-4" />
        <AlertDescription>
          No hotels found for your search criteria. Try adjusting your search parameters.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Hotel Results</h3>
        <p className="text-sm text-muted-foreground">
          {hotels.length} hotels found
        </p>
      </div>

      <div className="space-y-4">
        {hotels.map((hotel) => (
          <Card key={hotel.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex gap-4">
                {hotel.photos?.[0] && (
                  <img
                    src={hotel.photos[0]}
                    alt={hotel.name}
                    className="w-48 h-32 object-cover rounded-lg"
                  />
                )}
                
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-lg font-semibold">{hotel.name}</h4>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span>{hotel.address}</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {hotel.currency} {hotel.price}
                      </div>
                      <p className="text-sm text-muted-foreground">per night</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    {hotel.rating > 0 && (
                      <div className="flex items-center gap-1">
                        {[...Array(hotel.rating)].map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        ))}
                        {[...Array(5 - hotel.rating)].map((_, i) => (
                          <Star key={i} className="h-3 w-3 text-gray-300" />
                        ))}
                      </div>
                    )}
                    {hotel.reviewScore && (
                      <Badge variant="secondary">
                        {hotel.reviewScore}/10
                      </Badge>
                    )}
                  </div>

                  {hotel.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {hotel.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {hotel.amenities.slice(0, 4).map((amenity) => {
                        const IconComponent = amenityIcons[amenity];
                        return (
                          <Badge key={amenity} variant="outline" className="text-xs">
                            {IconComponent && typeof IconComponent === 'function' ? (
                              <IconComponent className="h-3 w-3 mr-1" />
                            ) : (
                              <span className="mr-1">{amenityIcons[amenity] || '•'}</span>
                            )}
                            {amenity}
                          </Badge>
                        );
                      })}
                      {hotel.amenities.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{hotel.amenities.length - 4} more
                        </Badge>
                      )}
                    </div>

                    <Button
                      onClick={() => handleBookHotel(hotel)}
                    >
                      Book Now
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedHotel && (
        <BookingDialog
          open={showBookingDialog}
          onOpenChange={setShowBookingDialog}
          bookingType="hotel"
          itemData={selectedHotel}
          searchParams={searchParams}
        />
      )}
    </div>
  );
}