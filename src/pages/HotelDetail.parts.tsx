import { ScrollReveal } from '@/components/animation/ScrollReveal';
import {
  Star,
  MapPin,
  Phone,
  Globe,
  Mail,
  DollarSign,
  ExternalLink,
  Wifi,
  Shield,
  Luggage,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { EntityMap } from '@/components/map/EntityMap';
import { getHotelPhotosToShow } from './hotelPhotosUtil';
import type { Database } from '@/integrations/supabase/types';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

type Hotel = Database['public']['Tables']['hotels']['Row'];
export type HotelWithRelations = Hotel & {
  cities?: { id: string; name: string } | null;
  countries?: { id: string; name: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  bnb: 'B&B',
  hostel: 'Hostel',
  guesthouse: 'Guesthouse',
  apartment: 'Apartment',
  resort: 'Resort',
  other: 'Other',
};

interface HeroProps {
  hotel: HotelWithRelations;
  cityName: string;
  countryName: string;
  tripCount?: number;
  isInTrip?: boolean;
  onAddToTrip: () => void;
}

export function HotelHero({ hotel, cityName, countryName, tripCount, isInTrip, onAddToTrip }: HeroProps) {
  const heroImage = hotel.images && hotel.images.length > 0 ? hotel.images[0] : null;
  // Website is only useful when it points somewhere different than the
  // booking URL — otherwise it's a duplicate of "Book Now".
  const showWebsite = Boolean(hotel.website) && hotel.website !== hotel.booking_url;
  return (
    <>
      <div className="rounded-md overflow-hidden mb-6 h-[300px]">
          <img
            loading="lazy"
            src={heroImage || getRandomFallbackImage()}
            alt={hotel.name}
            className="w-full h-full object-cover"
          />
        </div>
      <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-2xl font-bold">{hotel.name}</h4>
            {hotel.verified && <Shield className="w-5 h-5" />}
          </div>
          <p className="text-muted-foreground">
            {hotel.hotel_type && <>{TYPE_LABELS[hotel.hotel_type] || hotel.hotel_type} &middot; </>}
            {cityName && countryName ? `${cityName}, ${countryName}` : cityName || countryName || ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onAddToTrip}>
            <Luggage className="w-3.5 h-3.5 mr-1.5" />
            Add to Trip
          </Button>
          {isInTrip && (
            <Badge variant="secondary">
              In {tripCount} trip{tripCount !== 1 ? 's' : ''}
            </Badge>
          )}
          <ReportButton contentType="hotels" contentId={hotel.id} contentName={hotel.name} />
          <AdminEditButton
            contentType="hotels"
            contentId={hotel.id}
            contentName={hotel.name}
            ownerUserId={hotel.created_by ?? undefined}
            currentData={hotel as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
          {hotel.booking_url && (
            <Button size="sm" asChild>
              <a href={hotel.booking_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1.5" />
                Book Now
              </a>
            </Button>
          )}
          {showWebsite && (
            <Button variant="outline" size="sm" asChild>
              <a href={hotel.website!} target="_blank" rel="noopener noreferrer">
                <Globe className="w-4 h-4 mr-1.5" />
                Website
              </a>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {hotel.star_rating && (
          <Badge variant="outline" className="gap-1">
            <Star className="w-3.5 h-3.5" style={{ fill: 'currentColor' }} />
            {`${hotel.star_rating} Stars`}
          </Badge>
        )}
        {hotel.price_range && (
          <Badge variant="outline" className="gap-1">
            <DollarSign className="w-3.5 h-3.5" />
            {'$'.repeat(hotel.price_range)}
          </Badge>
        )}
        {hotel.lgbtq_friendly && <Badge>LGBTQ+ Friendly</Badge>}
        {cityName && (
          <Badge variant="outline" className="gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {`${cityName}${countryName ? `, ${countryName}` : ''}`}
          </Badge>
        )}
      </div>
    </>
  );
}

export function HotelOverview({ hotel, t }: { hotel: HotelWithRelations; t: (k: string, d?: string) => string }) {
  const hasMap = typeof hotel.latitude === 'number' && typeof hotel.longitude === 'number';
  return (
    <ScrollReveal direction="up">
    <div className="flex flex-col gap-6">
      {hotel.description && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.about', 'About')}</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{hotel.description}</p>
          </CardContent>
        </Card>
      )}
      {hotel.queer_safety_notes && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.safetyNotes', 'Safety Notes')}</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{hotel.queer_safety_notes}</p></CardContent>
        </Card>
      )}
      {hotel.amenities && hotel.amenities.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.amenities', 'Amenities')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {hotel.amenities.map((amenity, i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  <Wifi className="w-3.5 h-3.5" />
                  {amenity}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {hasMap && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.location', 'Location')}</CardTitle></CardHeader>
          <CardContent>
            <EntityMap
              center={[hotel.longitude as number, hotel.latitude as number]}
              zoom={14}
              height={320}
              markers={[
                {
                  id: hotel.id,
                  lat: hotel.latitude as number,
                  lng: hotel.longitude as number,
                  name: hotel.name,
                  primary: true,
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
    </ScrollReveal>
  );
}

export function HotelSidebar({ hotel, t }: { hotel: HotelWithRelations; t: (k: string, d?: string) => string }) {
  const hasContact = Boolean(hotel.address || hotel.phone || hotel.email);
  return (
    <ScrollReveal direction="up">
    <div className="flex flex-col gap-4">
      {hasContact && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.contact', 'Contact')}</CardTitle></CardHeader>
          <CardContent>
            {hotel.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-sm">{hotel.address}</p>
              </div>
            )}
            {hotel.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 shrink-0" />
                <a href={`tel:${hotel.phone}`} className="text-sm">{hotel.phone}</a>
              </div>
            )}
            {hotel.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" />
                <a href={`mailto:${hotel.email}`} className="text-sm">{hotel.email}</a>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {hotel.tags && hotel.tags.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.tags', 'Tags')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {hotel.tags.map((tag, i) => (
                <Badge key={i} variant="outline">{tag}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </ScrollReveal>
  );
}

export function HotelPhotos({ hotel }: { hotel: HotelWithRelations }) {
  const photos = getHotelPhotosToShow(hotel.images);
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
      {photos.map((img, i) => (
        <div key={img} className="rounded-md overflow-hidden h-[200px]">
          <img
            src={img}
            alt={`${hotel.name} ${i + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
