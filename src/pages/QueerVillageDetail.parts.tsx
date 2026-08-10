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
import { ParallaxHero } from '@/components/effects/ParallaxHero';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TagChipRow } from '@/components/tags/TagChipRow';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import { StopList, type Stop } from '@/components/transit/StopList';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import { EventCard } from '@/components/events/EventCard';
import { EntityMap } from '@/components/map/EntityMap';
import { useVisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];
type Event = Database['public']['Tables']['events']['Row'];

export type VillageWithRelations = {
  id: string;
  name: string;
  slug: string;
  social_links?: Record<string, string> | null;
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

export function buildVillageBreadcrumbs(village: VillageWithRelations, t: TFunction) {
  const crumbs: { label: ReactNode; href?: string }[] = [
    { label: t('breadcrumb.villages', 'Queer villages'), href: '/villages' },
  ];
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
  onContentUpdated?: () => void;
}

export function VillageHero({ village, isFavorited, onFavoriteToggle, onContentUpdated }: VillageHeroProps) {
  return (
    <div>
      {village.image_url && (
        <ParallaxHero className="relative mb-6 h-[200px] overflow-hidden md:h-[280px]">
          <img
            src={village.image_url}
            alt={village.name}
            role="presentation"
            className="h-full w-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {village.featured && (
            <Badge
              style={{ top: 12, right: 12, backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              className="absolute"
            >
              Featured
            </Badge>
          )}
        </ParallaxHero>
      )}

      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-headline font-bold text-foreground lg:text-4xl">
            {village.countries?.flag_emoji && <>{village.countries.flag_emoji} </>}
            <Editable
              contentType="queer_villages"
              recordId={village.id}
              field="name"
              value={village.name}
              onSaved={onContentUpdated}
            >
              {village.name}
            </Editable>
          </h1>
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin size={16} />
            <p className="text-lg">
              {village.cities && (
                <LocalizedLink
                  to={`/city/${village.cities.slug || village.cities.id}`}
                  style={{ color: 'inherit', textUnderlineOffset: '2px' }}
                  className="underline"
                >
                  {village.cities.name}
                </LocalizedLink>
              )}
              {village.cities && village.countries && ', '}
              {village.countries && (
                <LocalizedLink
                  to={`/country/${village.countries.slug || village.countries.id}`}
                  style={{ color: 'inherit', textUnderlineOffset: '2px' }}
                  className="underline"
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
                <ExternalLink size={16} className="mr-1.5" />
                Website
              </a>
            </Button>
          )}
          <EntitySocialLinks links={village.social_links} size="sm" />
        </div>
      </div>

      {village.tags && village.tags.length > 0 && (
        <TagChipRow tags={village.tags} className="mb-4" more="expand" />
      )}
    </div>
  );
}

export const villageTabIcons = {
  Landmark,
  Building,
  Calendar,
  ImageIcon,
  MapPin,
};

export function VillageOverviewTab({ village, onContentUpdated }: { village: VillageWithRelations; onContentUpdated?: () => void }) {
  return (
    <ScrollReveal direction="up">
      <div className="mt-6 flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle style={{ alignItems: 'center' }} className="flex gap-2">
                <Landmark size={20} />
                About {village.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Editable
                contentType="queer_villages"
                recordId={village.id}
                field="description"
                value={village.description ?? ''}
                onSaved={onContentUpdated}
                fieldOverride={{ type: 'textarea' }}
                as="div"
              >
                <p className="leading-relaxed text-muted-foreground">
                  {village.description ||
                    `${village.name} is an LGBTQ+ neighborhood in ${village.cities?.name || 'the city'}.`}
                </p>
              </Editable>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ alignItems: 'center' }} className="flex gap-2">
                <MapPin size={20} />
                Notable Landmarks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {village.notable_landmarks && village.notable_landmarks.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {village.notable_landmarks.map((landmark, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-element bg-accent p-4">
                      <Landmark className="text-muted-foreground shrink-0" size={16} />
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
              <CardTitle style={{ alignItems: 'center' }} className="flex gap-2">
                <Globe size={20} />
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
              <CardTitle style={{ alignItems: 'center' }} className="flex gap-2">
                <MapPin size={20} />
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

/**
 * Venues → stop-list stops, with the gap between consecutive stops expressed
 * as straight-line distance.
 *
 * Deliberately NOT sorted by rating, popularity or any score: the spec's
 * zero-hierarchy rule applies, and a village walk is a sequence, not a
 * ranking. Order is whatever the caller supplied.
 *
 * A venue missing coordinates simply gets no gap label rather than being
 * dropped — it is still a stop on the walk, we just cannot say how far.
 */
function villageStops(venues: VillageVenue[]): Stop[] {
  return venues.map((v, i) => {
    const prev = i > 0 ? venues[i - 1] : null;
    const hasPair =
      prev &&
      typeof prev.latitude === 'number' &&
      typeof prev.longitude === 'number' &&
      typeof v.latitude === 'number' &&
      typeof v.longitude === 'number';
    let gap: string | null = null;
    if (hasPair) {
      const km = calculateDistanceKm(
        Number(prev!.latitude),
        Number(prev!.longitude),
        Number(v.latitude),
        Number(v.longitude),
      );
      if (km < 1) {
        const m = Math.round((km * 1000) / 50) * 50;
        // Below ~25 m the rounding lands on zero, and "~0 m" is not a gap — it
        // is two venues sharing a coordinate (often a city centroid stamped by
        // the geo backfill). No label is honest; a zero label is not.
        gap = m > 0 ? `~${m} m` : null;
      } else {
        gap = `~${km.toFixed(1)} km`;
      }
    }
    return {
      id: v.id,
      name: v.name,
      type: 'venue',
      href: v.slug ? `/venues/${v.slug}` : undefined,
      walkFromPrevious: gap,
      accessNote: v.category ?? null,
    };
  });
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
        {/* The village, not its city. This read "Venues in Madrid" while the
            query was city-wide; now that the list is the village's own venues,
            the city name would misdescribe it. */}
        <h3 className="mb-4 text-lg font-semibold">Venues in {village.name}</h3>
        {loading ? (
          <div className="flex justify-center py-16">
            <p className="text-muted-foreground">Loading venues...</p>
          </div>
        ) : venues.length > 0 ? (
          // Spec module 05 (stop list) — REQUIRED on villages, and the module
          // the spec says defines the type: "A village is a walkable cluster.
          // It reads as a route through stations with walking times, not a
          // boundary polygon." A card grid states membership; a stop list
          // states the walk, which is the thing worth knowing.
          //
          // The gap label is STRAIGHT-LINE distance, not a routed walking
          // time. The spec asks for walk times and the product has no routing
          // source, so this derives what the coordinates honestly support and
          // labels it as distance ("~400 m"). Rendering "5 min walk" from a
          // crow-flies number would invent precision across a canal.
          <StopList stops={villageStops(venues)} />
        ) : (
          <div className="py-16 text-center">
            <Building
              size={48}
              style={{ margin: '0 auto 16px' }}
              className="text-muted-foreground"
            />
            <h3 className="text-lg text-muted-foreground">No venues yet</h3>
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
              size={48}
              style={{ margin: '0 auto 16px' }}
              className="text-muted-foreground"
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
            <div key={i} className="h-[200px] overflow-hidden rounded-element bg-accent">
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
            size={48}
            style={{ margin: '0 auto 16px' }}
            className="text-muted-foreground"
          />
          <h3 className="text-lg text-muted-foreground">No photos yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Photos will be added soon.</p>
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
  const visitedLookup = useVisitedPlaceLookup();
  if (typeof village.latitude !== 'number' || typeof village.longitude !== 'number') return null;
  return (
    <EntityMap
      center={[Number(village.longitude), Number(village.latitude)]}
      zoom={14}
      height={400}
      visitedLookup={visitedLookup}
      markers={[
        {
          id: village.id,
          lat: Number(village.latitude),
          lng: Number(village.longitude),
          name: village.name ?? 'Village',
          type: 'neighbourhoods',
          primary: true,
          entityType: 'village',
          entityId: village.id,
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
            entityType: 'venue' as const,
            entityId: v.id,
          })),
      ]}
    />
  );
}

export function VillageTabLabel({ icon: Icon, label }: { icon: typeof Landmark; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden="true" style={{ height: 16, width: 16 }} />
      {/* sr-only (not hidden) on mobile so the tab keeps an accessible name
        when the label is visually collapsed to the icon — WCAG 4.1.2. */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}
