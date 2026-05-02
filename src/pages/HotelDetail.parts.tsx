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
import type { Database } from '@/integrations/supabase/types';

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
  return (
    <>
      {heroImage && (
        <div className="rounded-md overflow-hidden mb-6 h-[300px]">
          <img
            loading="lazy"
            src={heroImage}
            alt={hotel.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-2xl font-bold">{hotel.name}</h4>
            {hotel.verified && <Shield className="w-5 h-5" style={{ color: '#10b981' }} />}
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
          {hotel.website && (
            <Button variant="outline" size="sm" onClick={() => window.open(hotel.website!, '_blank')}>
              <Globe className="w-4 h-4 mr-1.5" />
              Website
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {hotel.star_rating && (
          <Badge variant="outline" className="gap-1">
            <Star className="w-3.5 h-3.5" style={{ fill: '#f59e0b', color: '#f59e0b' }} />
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
  return (
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
    </div>
  );
}

export function HotelSidebar({ hotel, t }: { hotel: HotelWithRelations; t: (k: string, d?: string) => string }) {
  return (
    <div className="flex flex-col gap-4">
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
  );
}

export function HotelPhotos({ hotel }: { hotel: HotelWithRelations }) {
  if (!hotel.images || hotel.images.length <= 1) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
      {hotel.images.map((img, i) => (
        <div key={i} className="rounded-md overflow-hidden h-[200px]">
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
