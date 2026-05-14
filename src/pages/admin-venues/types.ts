export interface VenueRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  is_featured: boolean;
  verified: boolean;
  price_range: number | null;
  foursquare_rating: number | null;
  latitude: number | null;
  longitude: number | null;
  amenities: string[] | null;
  tags: string[] | null;
  images: string[] | null;
  city_id: string | null;
  country_id: string | null;
  created_at: string;
  created_by: string | null;
  is_organizer: boolean;
  organizer_handles: Record<string, string> | null;
}

export const venueCategories = [
  'restaurant', 'bar', 'cafe', 'hotel', 'club', 'theater',
  'museum', 'gallery', 'park', 'gym', 'spa', 'shop', 'other',
];

export const commonAmenities = [
  'WiFi', 'Parking', 'Wheelchair Accessible', 'Pet Friendly',
  'Outdoor Seating', 'Live Music', 'Air Conditioning', 'Heating',
  'Private Dining', 'Takeout', 'Delivery', 'Reservations',
];

export interface VenueFormData {
  name: string;
  description: string;
  category: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  price_range: string;
  is_featured: boolean;
  verified: boolean;
  latitude: string;
  longitude: string;
  amenities: string[];
  tags: string[];
  images: string[];
  city_id: string | undefined;
  country_id: string | undefined;
  is_organizer: boolean;
  organizer_handles: Record<string, string>;
}

export const emptyFormData: VenueFormData = {
  name: '',
  description: '',
  category: '',
  address: '',
  city: '',
  state: '',
  country: 'US',
  postal_code: '',
  phone: '',
  email: '',
  website: '',
  instagram: '',
  price_range: '1',
  is_featured: false,
  verified: false,
  latitude: '',
  longitude: '',
  amenities: [],
  tags: [],
  images: [],
  city_id: undefined,
  country_id: undefined,
  is_organizer: false,
  organizer_handles: {},
};
