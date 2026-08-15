import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { TagChipRow } from '@/components/tags/TagChipRow';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import { StopList, type Stop } from '@/components/transit/StopList';
import { OccurrenceList, type Occurrence } from '@/components/transit/OccurrenceList';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { MapInset } from '@/components/transit/MapInset';
import { GeoPhotoInset } from '@/components/geo/GeoPhotoInset';
import { calculateDistanceKm } from '@/utils/calculateDistance';
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
  last_verified_at?: string | null;
  created_at: string;
  updated_at: string;
  cities: { id: string; slug?: string; name: string } | null;
  countries: {
    id: string;
    slug?: string;
    name: string;
    code?: string;
    flag_emoji?: string;
    equality_score?: number | null;
    lgbti_criminalization?: Record<string, unknown> | null;
  } | null;
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

/**
 * The masthead's action row. `DetailMasthead` owns the bullet, kicker, title
 * and standfirst; this is spine part S5 plus the admin/report affordances that
 * used to be buried in the photo hero's top-right corner.
 */
export function VillageActions({
  village,
  onContentUpdated,
  t,
}: {
  village: VillageWithRelations;
  onContentUpdated?: () => void;
  t: TFunction;
}) {
  const OUTLINE =
    'inline-flex items-center gap-2 border-2 border-foreground px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background';
  return (
    <>
      {village.website && (
        <a href={village.website} target="_blank" rel="noopener noreferrer" className={OUTLINE}>
          {t('village.action.website', 'Website')}
        </a>
      )}
      <EntitySocialLinks links={village.social_links} size="sm" />
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
        onSaved={onContentUpdated}
      />
    </>
  );
}

/** S4 — one unstyled array, equal weight, never truncated behind a "more". */
export function VillageTags({ village }: { village: VillageWithRelations }) {
  if (!village.tags?.length) return null;
  return <TagChipRow tags={village.tags} more="expand" />;
}

/**
 * The about block. The old page split this across three `Card`s — About /
 * Notable Landmarks / Location — of which Notable Landmarks was empty on 81%
 * of villages and Location printed raw decimal coordinates, which no reader
 * has ever wanted. Rule 2 removed both; the coordinates became the map inset.
 *
 * `history` is populated on 100% of villages and `description` averages 73
 * characters, so the history is the substance here, not the footnote.
 */
export function VillageAbout({
  village,
  onContentUpdated,
  t,
}: {
  village: VillageWithRelations;
  onContentUpdated?: () => void;
  t: TFunction;
}) {
  return (
    <div className="flex flex-col gap-6">
      <GeoPhotoInset
        src={village.image_url}
        alt={village.name}
        fallbackKey={village.slug}
        caption={
          village.cities?.name
            ? t('village.photo.caption', '{{village}}, {{city}}', {
                village: village.name,
                city: village.cities.name,
              })
            : null
        }
      />
      {village.history && (
        <Editable
          contentType="queer_villages"
          recordId={village.id}
          field="history"
          value={village.history}
          onSaved={onContentUpdated}
          fieldOverride={{ type: 'textarea' }}
          as="div"
        >
          <p className="max-w-reading whitespace-pre-line text-body-lg leading-relaxed">
            {village.history}
          </p>
        </Editable>
      )}
      {village.notable_landmarks && village.notable_landmarks.length > 0 && (
        <div>
          <h3 className="text-title font-bold">
            {t('village.landmarks.title', 'Notable landmarks')}
          </h3>
          <ul className="mt-2 flex list-none flex-wrap gap-2 p-0">
            {village.notable_landmarks.map((landmark) => (
              <li
                key={landmark}
                className="border-2 border-foreground px-2 py-1 text-13 font-bold"
              >
                {landmark}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
export function villageStops(venues: VillageVenue[]): Stop[] {
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

/**
 * Spec module 05 — the module the spec says DEFINES this type: "A village is a
 * walkable cluster. It reads as a route through stations with walking times,
 * not a boundary polygon." A card grid states membership; a stop list states
 * the walk, which is the thing worth knowing.
 *
 * The gap label is STRAIGHT-LINE distance, not a routed walking time. The spec
 * asks for walk times and the product has no routing source, so this derives
 * what the coordinates honestly support and labels it as distance ("~400 m").
 * Rendering "5 min walk" from a crow-flies number would invent precision
 * across a canal.
 */
export function VillageStops({ venues }: { venues: VillageVenue[] }) {
  if (venues.length === 0) return null;
  return <StopList stops={villageStops(venues)} />;
}

/**
 * Spec module 03 — the next departures from this village's OWN venues.
 *
 * The action link inherits its colour rather than carrying a border: the
 * module ink-floods its first row (the one next instance), and a
 * `border-foreground` chip on flooded ink is invisible.
 */
export function villageOccurrences(
  events: VillageEvent[],
  venues: VillageVenue[],
  locale: string,
  openLabel: string,
): Occurrence[] {
  const venueName = new Map(venues.map((v) => [v.id, v.name]));
  return events.slice(0, 8).map((e) => {
    const d = e.start_date ? new Date(e.start_date) : null;
    const date =
      d && !Number.isNaN(d.getTime())
        ? d
            .toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
            .toUpperCase()
        : '';
    const at = e.venue_id ? venueName.get(e.venue_id) : null;
    return {
      id: e.id,
      date,
      detail: at ? `${e.title} · ${at}` : e.title,
      status: e.is_free ? 'FREE' : undefined,
      action: e.slug ? (
        <LocalizedLink
          to={`/events/${e.slug}`}
          aria-label={e.title}
          className="text-2xs font-bold uppercase tracking-label underline"
        >
          {openLabel}
        </LocalizedLink>
      ) : undefined,
    };
  });
}

export function VillageOccurrences({
  events,
  venues,
  locale,
  openLabel,
}: {
  events: VillageEvent[];
  venues: VillageVenue[];
  locale: string;
  openLabel: string;
}) {
  const occurrences = villageOccurrences(events, venues, locale, openLabel);
  if (occurrences.length === 0) return null;
  return <OccurrenceList occurrences={occurrences} />;
}

/** Spec module 08 + rule 4 — the parent city, wearing the CITY's bullet. */
export function VillageParentCity({
  village,
  t,
}: {
  village: VillageWithRelations;
  t: TFunction;
}) {
  const city = village.cities;
  if (!city) return null;
  return (
    <NestedEntityCard
      type="city"
      eyebrow={village.countries?.name ?? null}
      name={city.name}
      description={t('village.parentCity.body', 'The wider city this district sits in.')}
      href={`/city/${city.slug || city.id}`}
      actionLabel={t('village.parentCity.action', 'Open')}
    />
  );
}

export function VillagePhotos({ village, t }: { village: VillageWithRelations; t: TFunction }) {
  if (!village.images?.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {village.images.map((img, i) => (
        <div key={img} className="border-2 border-foreground">
          <img
            src={img}
            alt={t('village.photo.alt', '{{name}}, photo {{n}}', {
              name: village.name,
              n: i + 1,
            })}
            className="h-[200px] w-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

/** Spec module 16 — required on villages. A frame, not a second map. */
export function VillageMapInset({
  village,
  venues,
  caption,
}: {
  village: VillageWithRelations;
  venues: VillageVenue[];
  caption?: string;
}) {
  const visitedLookup = useVisitedPlaceLookup();
  if (typeof village.latitude !== 'number' || typeof village.longitude !== 'number') return null;
  return (
    <MapInset caption={caption}>
      <EntityMap
        center={[Number(village.longitude), Number(village.latitude)]}
        zoom={15}
        height={280}
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
    </MapInset>
  );
}
