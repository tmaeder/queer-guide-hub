import {
  MapPin,
  Globe,
  Landmark,
  Building,
  Calendar,
  ExternalLink,
  Heart,
  Image as ImageIcon,
} from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { VenueCard } from '@/components/venues/VenueCard';
import { EventCard } from '@/components/events/EventCard';
import { EntityMap } from '@/components/map/EntityMap';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import type { ReactNode } from 'react';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];
type Event = Database['public']['Tables']['events']['Row'];

export type VillageWithRelations = {
  id: string;
  name: string;
  slug: string;
  city_id: string;
  country_id: string;
  description: string | null;
  history: string | null;
  image_url: string | null;
  images: string[] | null;
  latitude: number | null;
  longitude: number | null;
  boundaries: Record<string, unknown> | null;
  notable_landmarks: string[] | null;
  tags: string[] | null;
  website: string | null;
  featured: boolean | null;
  created_at: string;
  updated_at: string;
  cities: { id: string; slug?: string; name: string } | null;
  countries: { id: string; slug?: string; name: string; flag_emoji?: string } | null;
};

type VillageVenue = Venue;
type VillageEvent = Event;

// eslint-disable-next-line react-refresh/only-export-components
export function buildVillageBreadcrumbs(village: VillageWithRelations) {
  const crumbs: { label: ReactNode; href?: string }[] = [{ label: 'Villages', href: '/villages' }];
  if (village.countries) {
    crumbs.push({
      label: village.countries.name,
      href: `/country/${village.countries.slug || village.countries.id}`,
    });
  }
  if (village.cities) {
    crumbs.push({
      label: village.cities.name,
      href: `/city/${village.cities.slug || village.cities.id}`,
    });
  }
  crumbs.push({ label: village.name });
  return crumbs;
}

interface VillageHeroProps {
  village: VillageWithRelations;
  isFavorited: boolean;
  onFavoriteToggle: () => void;
}

export function VillageHero({ village, isFavorited, onFavoriteToggle }: VillageHeroProps) {
  return (
    <Box>
      {village.image_url && (
        <Box
          sx={{
            position: 'relative',
            height: { xs: 200, md: 280 },
            borderRadius: 2,
            overflow: 'hidden',
            mb: 3,
          }}
        >
          <Box
            component="img"
            src={village.image_url}
            alt={village.name}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {village.featured && (
            <Badge
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                backgroundColor: 'hsl(var(--primary))',
                color: 'white',
              }}
            >
              Featured
            </Badge>
          )}
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography
            variant="h3"
            sx={{
              fontSize: { xs: '1.75rem', lg: '2.25rem' },
              fontWeight: 700,
              color: 'text.primary',
              mb: 0.5,
            }}
          >
            {village.countries?.flag_emoji && <>{village.countries.flag_emoji} </>}
            {village.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            <MapPin style={{ width: 16, height: 16 }} />
            <Typography sx={{ fontSize: '1.125rem' }}>
              {village.cities && (
                <LocalizedLink
                  to={`/city/${village.cities.slug || village.cities.id}`}
                  style={{
                    color: 'inherit',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  }}
                >
                  {village.cities.name}
                </LocalizedLink>
              )}
              {village.cities && village.countries && ', '}
              {village.countries && (
                <LocalizedLink
                  to={`/country/${village.countries.slug || village.countries.id}`}
                  style={{
                    color: 'inherit',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  }}
                >
                  {village.countries.name}
                </LocalizedLink>
              )}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, mt: 1, flexWrap: 'wrap' }}>
          <ReportButton
            contentType="queer_villages"
            contentId={village.id}
            contentName={village.name}
          />
          <AdminEditButton
            contentType="queer_villages"
            contentId={village.id}
            contentName={village.name}
            currentData={village as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
          <Button variant="outline" size="sm" onClick={onFavoriteToggle}>
            <Heart
              style={{
                height: 16,
                width: 16,
                marginRight: 6,
                ...(isFavorited ? { fill: 'currentColor' } : {}),
              }}
            />
            {isFavorited ? 'Favorited' : 'Favorite'}
          </Button>
          {village.website && (
            <Button variant="outline" size="sm" asChild>
              <a href={village.website} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ height: 16, width: 16, marginRight: 6 }} />
                Website
              </a>
            </Button>
          )}
        </Box>
      </Box>

      {village.tags && village.tags.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
          {village.tags.map((tag, i) => (
            <Chip key={i} label={tag} size="small" variant="outlined" />
          ))}
        </Box>
      )}
    </Box>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const villageTabIcons = {
  Landmark,
  Building,
  Calendar,
  ImageIcon,
  MapPin,
};

export function VillageOverviewTab({ village }: { village: VillageWithRelations }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: 3 }}>
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Landmark style={{ height: 20, width: 20 }} />
              About {village.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
              {village.description ||
                `Discover ${village.name}, a vibrant LGBTQ+ neighborhood in ${village.cities?.name || 'the city'}.`}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin style={{ height: 20, width: 20 }} />
              Notable Landmarks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {village.notable_landmarks && village.notable_landmarks.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {village.notable_landmarks.map((landmark, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Landmark
                      style={{ width: 16, height: 16, flexShrink: 0, color: '#777777' }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {landmark}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No landmarks listed yet.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>

      {village.history && (
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe style={{ height: 20, width: 20 }} />
              History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Typography
              sx={{ color: 'text.secondary', lineHeight: 1.7, whiteSpace: 'pre-line' }}
            >
              {village.history}
            </Typography>
          </CardContent>
        </Card>
      )}

      {village.latitude && village.longitude && (
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin style={{ height: 20, width: 20 }} />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
            >
              {village.latitude.toFixed(4)}, {village.longitude.toFixed(4)}
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export function VillageVenuesTab({
  village,
  venues,
  loading,
}: {
  village: VillageWithRelations;
  venues: VillageVenue[];
  loading: boolean;
}) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        Venues in {village.cities?.name || 'the area'}
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <Typography color="text.secondary">Loading venues...</Typography>
        </Box>
      ) : venues.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {venues.map((venue) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Building
            style={{
              height: 48,
              width: 48,
              color: 'hsl(var(--muted-foreground))',
              margin: '0 auto 16px',
            }}
          />
          <Typography variant="h6" color="text.secondary">
            No venues found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Check back later as we continue to add venues in this area.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function VillageEventsTab({
  village,
  events,
  loading,
}: {
  village: VillageWithRelations;
  events: VillageEvent[];
  loading: boolean;
}) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        Events in {village.cities?.name || 'the area'}
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <Typography color="text.secondary">Loading events...</Typography>
        </Box>
      ) : events.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Calendar
            style={{
              height: 48,
              width: 48,
              color: 'hsl(var(--muted-foreground))',
              margin: '0 auto 16px',
            }}
          />
          <Typography variant="h6" color="text.secondary">
            No upcoming events
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Check back later for events in this area.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function VillagePhotosTab({ village }: { village: VillageWithRelations }) {
  return (
    <Box sx={{ mt: 3 }}>
      {village.images && village.images.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {village.images.map((img, i) => (
            <Box
              key={i}
              sx={{ borderRadius: 2, overflow: 'hidden', height: 200, bgcolor: 'action.hover' }}
            >
              <img
                src={img}
                alt={`${village.name} ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                loading="lazy"
              />
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <ImageIcon
            style={{
              height: 48,
              width: 48,
              color: 'hsl(var(--muted-foreground))',
              margin: '0 auto 16px',
            }}
          />
          <Typography variant="h6" color="text.secondary">
            No photos yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Photos will be added soon.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function VillageMapTab({
  village,
  venues,
}: {
  village: VillageWithRelations;
  venues: VillageVenue[];
}) {
  if (typeof village.latitude !== 'number' || typeof village.longitude !== 'number') return null;
  return (
    <EntityMap
      center={[Number(village.longitude), Number(village.latitude)]}
      zoom={14}
      height={400}
      markers={[
        {
          id: village.id,
          lat: Number(village.latitude),
          lng: Number(village.longitude),
          name: village.name ?? 'Village',
          type: 'neighbourhoods',
          primary: true,
        },
        ...venues
          .filter((v) => typeof v.latitude === 'number' && typeof v.longitude === 'number')
          .map((v) => ({
            id: v.id,
            lat: Number(v.latitude),
            lng: Number(v.longitude),
            name: v.name ?? 'Venue',
            subtitle: v.category ?? undefined,
            type: 'venues' as const,
            linkTo: `/venues/${v.slug || v.id}`,
          })),
      ]}
    />
  );
}

export function VillageTabLabel({
  icon: Icon,
  label,
}: {
  icon: typeof Landmark;
  label: string;
}) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Icon style={{ height: 16, width: 16 }} />
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
        {label}
      </Box>
    </Box>
  );
}
