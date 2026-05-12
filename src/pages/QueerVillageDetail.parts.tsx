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
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { VenueCard } from '@/components/venues/VenueCard';
import { EventCard } from '@/components/events/EventCard';
import { EntityMap } from '@/components/map/EntityMap';
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
    <div>
      {village.image_url && (
        <div className="relative mb-6 h-[200px] overflow-hidden rounded-lg md:h-[280px]">
          <img
            src={village.image_url}
            alt={village.name}
            className="h-full w-full object-cover"
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
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[1.75rem] font-bold text-foreground lg:text-[2.25rem]">
            {village.countries?.flag_emoji && <>{village.countries.flag_emoji} </>}
            {village.name}
          </h1>
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin style={{ width: 16, height: 16 }} />
            <p className="text-lg">
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
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-shrink-0 flex-wrap gap-2">
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
        </div>
      </div>

      {village.tags && village.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {village.tags.map((tag, i) => (
            <Badge key={i} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
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
    <ScrollReveal direction="up">
    <div className="mt-6 flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Landmark style={{ height: 20, width: 20 }} />
              About {village.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed text-muted-foreground">
              {village.description ||
                `Discover ${village.name}, a vibrant LGBTQ+ neighborhood in ${village.cities?.name || 'the city'}.`}
            </p>
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
              <div className="flex flex-col gap-2">
                {village.notable_landmarks.map((landmark, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg bg-accent p-3"
                  >
                    <Landmark
                      className="text-muted-foreground"
                      style={{ width: 16, height: 16, flexShrink: 0 }}
                    />
                    <p className="text-sm font-medium">{landmark}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No landmarks listed yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {village.history && (
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe style={{ height: 20, width: 20 }} />
              History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
              {village.history}
            </p>
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
            <p className="font-mono text-sm text-muted-foreground">
              {village.latitude.toFixed(4)}, {village.longitude.toFixed(4)}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
    </ScrollReveal>
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
    <ScrollReveal direction="up">
    <div className="mt-6">
      <h3 className="mb-4 text-lg font-semibold">
        Venues in {village.cities?.name || 'the area'}
      </h3>
      {loading ? (
        <div className="flex justify-center py-16">
          <p className="text-muted-foreground">Loading venues...</p>
        </div>
      ) : venues.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {venues.map((venue) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <Building
            style={{
              height: 48,
              width: 48,
              color: 'hsl(var(--muted-foreground))',
              margin: '0 auto 16px',
            }}
          />
          <h3 className="text-lg text-muted-foreground">No venues found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Check back later as we continue to add venues in this area.
          </p>
        </div>
      )}
    </div>
    </ScrollReveal>
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
    <ScrollReveal direction="up">
    <div className="mt-6">
      <h3 className="mb-4 text-lg font-semibold">
        Events in {village.cities?.name || 'the area'}
      </h3>
      {loading ? (
        <div className="flex justify-center py-16">
          <p className="text-muted-foreground">Loading events...</p>
        </div>
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <Calendar
            style={{
              height: 48,
              width: 48,
              color: 'hsl(var(--muted-foreground))',
              margin: '0 auto 16px',
            }}
          />
          <h3 className="text-lg text-muted-foreground">No upcoming events</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Check back later for events in this area.
          </p>
        </div>
      )}
    </div>
    </ScrollReveal>
  );
}

export function VillagePhotosTab({ village }: { village: VillageWithRelations }) {
  return (
    <div className="mt-6">
      {village.images && village.images.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {village.images.map((img, i) => (
            <div key={i} className="h-[200px] overflow-hidden rounded-lg bg-accent">
              <img
                src={img}
                alt={`${village.name} ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <ImageIcon
            style={{
              height: 48,
              width: 48,
              color: 'hsl(var(--muted-foreground))',
              margin: '0 auto 16px',
            }}
          />
          <h3 className="text-lg text-muted-foreground">No photos yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Photos will be added soon.
          </p>
        </div>
      )}
    </div>
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
    <span className="inline-flex items-center gap-1.5">
      <Icon style={{ height: 16, width: 16 }} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
