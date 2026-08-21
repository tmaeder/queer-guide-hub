import { Star, MapPin, Phone, Globe, Mail, Luggage, Navigation2, Sparkles } from 'lucide-react';
import { Instagram } from '@/components/icons/brand';
import { Card, CardContent } from '@/components/ui/card';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { ShareMenu } from '@/components/share/ShareMenu';
import { TagChipRow } from '@/components/tags/TagChipRow';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { FactGrid } from '@/components/transit/FactGrid';
import { HoursTable, type HoursRow } from '@/components/transit/HoursTable';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { MapInset } from '@/components/transit/MapInset';
import { PhotoInset } from '@/components/transit/PhotoInset';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { VenueEvents } from '@/components/venues/VenueEvents';
import { VenueCheckInButton } from '@/components/venues/VenueCheckInButton';
import { VenueRecentCheckins } from '@/components/venues/VenueRecentCheckins';
import { VenueSafetySignalDisplay } from '@/components/venues/VenueSafetySignalDisplay';
import { FeaturedInGuides } from '@/components/guides/FeaturedInGuides';
import { AmenityDisplay } from '@/components/venues/AmenityDisplay';
import { DestinationSafetyCard } from '@/components/safety/DestinationSafetyCard';
import { EntityMap, type EntityMapMarker } from '@/components/map/EntityMap';
import { NearbyMapLegend } from '@/components/map/NearbyMapLegend';
import { MarkVisitedButton } from '@/components/marks/MarkVisitedButton';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { buildPlaceChain } from '@/config/breadcrumbs';
import type { TFunction } from 'i18next';
import type { useVenueSocialSignals } from '@/hooks/useVenueSocialSignals';
import type { Database } from '@/integrations/supabase/types';
import { fetchVenueWithReviews } from '@/hooks/usePageFetchers';

type Venue = Database['public']['Tables']['venues']['Row'];
export type VenueReview = Database['public']['Tables']['venue_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

export type VenueWithRelations = Venue & {
  social_links?: Record<string, string> | null;
  cities?: { id: string; slug?: string; name: string } | null;
  countries?: {
    id: string;
    slug?: string;
    name: string;
    equality_score: number | null;
    lgbti_criminalization: Record<string, unknown> | null;
  } | null;
  // Set when the venue is the physical presence of a brand that also publishes
  // and/or sells online. Added with the organizations spine (joined below).
  organization_id?: string | null;
  organizations?: { slug: string; name: string; roles: string[] } | null;
};

export type SocialSignals = ReturnType<typeof useVenueSocialSignals>['data'];

// Geo embeds are BARE (no :city_id column hints): after the P2 FK re-point they
// resolve via PostgREST computed relationships, which column hints bypass.
export const VENUE_SELECT_FIELDS =
  '*, cities(id, slug, name), countries(id, slug, name, equality_score, lgbti_criminalization), organizations:organization_id(slug, name, roles)';

export interface FetchVenueResult {
  venue: VenueWithRelations | null;
  reviews: VenueReview[];
  redirectTo?: string;
  notFound?: boolean;
}

export async function fetchVenue(slug: string): Promise<FetchVenueResult> {
  return fetchVenueWithReviews<VenueWithRelations, VenueReview>(slug, VENUE_SELECT_FIELDS);
}

export function getPriceRange(range: number | null) {
  if (!range) return '';
  return '$'.repeat(range);
}

/**
 * Build the breadcrumb trail for a venue detail page.
 *
 * Only the joined `venue.cities.name` / `venue.countries.name` are used
 * for labels. The raw `venue.city` / `venue.country` text columns
 * contain a mix of full names and ISO codes (defect D5) — omit the
 * segment when the FK record is absent rather than render "CH".
 */
export function buildVenueBreadcrumbs(
  venue: VenueWithRelations | null,
  t: TFunction,
): Array<{ label: string; href?: string }> | undefined {
  if (!venue) return undefined;
  return [
    { label: t('breadcrumb.venues', 'Venues'), href: '/venues' },
    ...buildPlaceChain({
      countryName: venue.countries?.name ?? null,
      countrySlug: venue.countries?.slug || venue.countries?.id || null,
      cityName: venue.cities?.name ?? null,
      citySlug: venue.cities?.slug || venue.cities?.id || null,
    }).map((c) => ({ label: c.label as string, href: c.href })),
    { label: venue.name },
  ];
}

// venue.tags is uncontrolled scraper data — some rows carry 40+ noisy terms.
// Cap the visible chips so the tag row never becomes a wall.
const TAG_DISPLAY_LIMIT = 16;

const HOURS_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const HOURS_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fmtTime = (t: string): string => {
  // "0900" → "09:00"; "+0100" (next-day overflow) → "01:00 (next day)"
  const m = t.match(/^([+-]?)(\d{2})(\d{2})$/);
  if (!m) return t;
  const next = m[1] === '+' ? ' (next day)' : '';
  return `${m[2]}:${m[3]}${next}`;
};

// Per-day hours can be a free-text string ("9am-5pm"), an object
// ({open: "0900", close: "1700"} from Google Places), or absent.
// Returns the rendered label or null when the day has no usable data.
function renderHoursRow(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'closed') return null;
    return trimmed;
  }
  if (typeof value === 'object') {
    const obj = value as { open?: unknown; close?: unknown };
    const open = typeof obj.open === 'string' ? obj.open : null;
    const close = typeof obj.close === 'string' ? obj.close : null;
    if (!open || !close) return null;
    return `${fmtTime(open)}–${fmtTime(close)}`;
  }
  return null;
}

// The actual stored shape from the scraper is
// `{display, regular: [{day:1..7, open, close}], popular, open_now}`.
// `display` is the human-readable string and is the right thing to
// surface when present.
type HoursPeriod = { day: number; open: string; close: string };
function asHoursShape(
  hours: unknown,
): { display?: string; regular?: HoursPeriod[]; open_now?: boolean } | null {
  if (!hours || typeof hours !== 'object') return null;
  return hours as { display?: string; regular?: HoursPeriod[]; open_now?: boolean };
}

/** Surface the scraper's `open_now` flag when present; null = unknown. */
export function getOpenNow(hours: unknown): boolean | null {
  const shape = asHoursShape(hours);
  if (shape && typeof shape.open_now === 'boolean') return shape.open_now;
  return null;
}

// Collapse the `regular` array into a record keyed by day-name. Multiple
// open windows per day (e.g. lunch + dinner) are joined with ", ".
function regularToDayMap(regular: HoursPeriod[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of regular) {
    // day 1..7 = Mon..Sun (ISO). Some sources use 0..6 = Sun..Sat;
    // accept both gracefully.
    const idx = p.day >= 1 && p.day <= 7 ? p.day - 1 : (p.day + 6) % 7;
    const dayName = HOURS_DAYS[idx];
    if (!dayName) continue;
    const span = renderHoursRow(p);
    if (!span) continue;
    out[dayName] = out[dayName] ? `${out[dayName]}, ${span}` : span;
  }
  return out;
}

export function hasUsableHours(hours: unknown): boolean {
  const shape = asHoursShape(hours);
  if (!shape) return false;
  if (typeof shape.display === 'string' && shape.display.trim()) return true;
  if (Array.isArray(shape.regular) && shape.regular.length > 0) {
    return Object.keys(regularToDayMap(shape.regular)).length > 0;
  }
  // Legacy {monday: {open,close} | string} shape.
  const rec = hours as Record<string, unknown>;
  return HOURS_DAYS.some((day) => renderHoursRow(rec[day]) !== null);
}

// `unknown`, matching `hasUsableHours` above: the column is free-form jsonb
// (`Json` in the generated types), and `asHoursShape` is the narrowing step.
// Typing the parameter tighter only pushed a cast to each call site.
export function formatHours(hours: unknown) {
  const shape = asHoursShape(hours);
  if (!shape) return <p className="text-sm text-muted-foreground">Hours not available</p>;

  // Prefer the human-readable display string when the scraper produced
  // one — it's already localised and handles split shifts naturally.
  if (typeof shape.display === 'string' && shape.display.trim()) {
    return (
      <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.6 }}>
        {shape.display}
      </p>
    );
  }

  // Build day rows from `regular` if present, else fall back to the
  // legacy {monday: …} shape.
  const dayMap: Record<string, string> = Array.isArray(shape.regular)
    ? regularToDayMap(shape.regular)
    : HOURS_DAYS.reduce<Record<string, string>>((acc, day) => {
        const label = renderHoursRow((hours as Record<string, unknown>)[day]);
        if (label) acc[day] = label;
        return acc;
      }, {});

  if (Object.keys(dayMap).length === 0)
    return <p className="text-sm text-muted-foreground">Hours not available</p>;

  const rows: HoursRow[] = HOURS_DAYS.map((day, index) => ({
    day: HOURS_DAY_NAMES[index],
    open: dayMap[day] ?? 'Closed',
  }));

  // `todayIndex` is deliberately NOT passed. HOURS_DAYS is Monday-first, and
  // the reader's weekday is not the venue's — a bar in Auckland is already on
  // tomorrow. Highlighting the wrong row is worse than highlighting none, so
  // the table stays neutral until the venue's local day is available (it needs
  // `venue.timezone`, which this helper does not receive).
  return <HoursTable rows={rows} />;
}

/* ───────────────────────────── Hero ───────────────────────────── */

/**
 * The masthead action row (spine S5), lifted out of the photo hero.
 *
 * `VenueHero` used to own the masthead, the cover photo, the safety banner, a
 * bespoke `FactCell` bar that duplicated `FactGrid`, and this row. The single
 * takes the first from `DetailMasthead`, the second from `PhotoInset`, the
 * third from the body, and the fourth is deleted — one fact strip per page.
 */
export function VenueActions({
  venue,
  onAddToTrip,
  onShare,
  onCheckInSuccess,
  t,
}: {
  venue: VenueWithRelations;
  onAddToTrip: () => void;
  onShare: () => void;
  onCheckInSuccess: () => void;
  t: TFunction;
}) {
  const isClosed = Boolean(venue.closed_at);
  return (
    <>
      {!isClosed && (
        <Button onClick={onAddToTrip}>
          <Luggage size={16} className="mr-2" />
          {t('pages.venueDetail.addToTrip', 'Add to trip')}
        </Button>
      )}
      <FavoriteButton itemId={venue.id} type="venue" size="md" />
      {!isClosed && (
        <VenueCheckInButton
          venueId={venue.id}
          venueName={venue.name}
          venueLatitude={venue.latitude}
          venueLongitude={venue.longitude}
          onCheckInSuccess={onCheckInSuccess}
        />
      )}
      {venue.website && venue.url_status !== 'broken' && (
        <Button variant="outline" size="sm" asChild>
          <a href={venue.website} target="_blank" rel="noopener noreferrer nofollow">
            <Globe size={14} className="mr-1.5" />
            {t('venues.detail.website', 'Website')}
          </a>
        </Button>
      )}
      <ShareMenu
        url={
          typeof window !== 'undefined'
            ? window.location.href
            : `https://queer.guide/venues/${venue.slug ?? venue.id}`
        }
        title={venue.name}
      />
      <button type="button" onClick={onShare} className="sr-only">
        {t('pages.venueDetail.share', 'Share')}
      </button>
      <MarkVisitedButton entityType="venue" entityId={venue.id} kind="visited" />
      <ReportButton contentType="venues" contentId={venue.id} contentName={venue.name} />
      <AdminEditButton
        contentType="venues"
        contentId={venue.id}
        contentName={venue.name}
        currentData={venue as Record<string, unknown>}
        onSaved={() => window.location.reload()}
      />
    </>
  );
}

/** Cover photo + the country's criminalisation banner — the two things the
 *  hero carried that are not the masthead. Rendered at the top of the body. */
export function VenueBodyLead({ venue }: { venue: VenueWithRelations }) {
  return (
    <>
      {venue.countries?.lgbti_criminalization && (
        <SafetyAlertBanner
          criminalization={venue.countries.lgbti_criminalization as Record<string, unknown>}
          countryName={venue.countries.name ?? ''}
        />
      )}
      <PhotoInset
        src={venue.images?.[0] ?? venue.logo_url ?? null}
        alt={venue.name}
        fallbackEntityType="venue"
        fallbackKey={venue.id}
        priority
        caption={[venue.cities?.name, venue.countries?.name].filter(Boolean).join(', ') || null}
      />
    </>
  );
}

/* ──────────────────────────── Body blocks ─────────────────────── */

/**
 * The venue single's body, as named blocks rather than one `overview` blob.
 *
 * It was a single 200-line `VenueOverview` inside a one-section descriptor, so
 * the route rail had exactly one station and nothing to navigate. Each block is
 * now its own section, and `singleSections` drops the ones with no data — which
 * on this corpus is most of them for most venues: amenities are set on 8.9% of
 * the 23,335 live rows and `accessibility_attributes` on **6 of them**.
 */
export function VenueFacts({ venue, t }: { venue: VenueWithRelations; t: TFunction }) {
  const cityLabel = [venue.cities?.name, venue.countries?.name].filter(Boolean).join(', ');
  return (
    <FactGrid
      facts={[
        { label: t('venues.detail.address', 'Address'), value: venue.address },
        { label: t('venues.detail.city', 'City'), value: cityLabel },
        { label: t('venues.detail.category', 'Category'), value: venue.category },
        {
          label: t('venues.detail.price', 'Price'),
          value: getPriceRange(venue.price_range ?? null),
        },
        { label: t('venues.detail.phone', 'Phone'), value: venue.phone },
        {
          label: t('venues.detail.website', 'Website'),
          value: venue.website ? (
            <a href={venue.website} target="_blank" rel="noopener noreferrer">
              {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          ) : null,
        },
      ]}
    />
  );
}

export function VenueAbout({
  venue,
  onContentUpdated,
}: {
  venue: VenueWithRelations;
  onContentUpdated?: () => void;
}) {
  if (!venue.description) return null;
  return (
    <Editable
      contentType="venues"
      recordId={venue.id}
      field="description"
      value={venue.description}
      onSaved={onContentUpdated}
      fieldOverride={{ type: 'textarea' }}
      as="div"
    >
      <p className="max-w-reading whitespace-pre-wrap text-body-lg leading-relaxed">
        {venue.description}
      </p>
    </Editable>
  );
}

/** Spec module 08 — leads with the ORGANISATION's bullet, not the venue's. */
export function VenueRunBy({ venue, t }: { venue: VenueWithRelations; t: TFunction }) {
  if (!venue.organizations) return null;
  return (
    <NestedEntityCard
      type="organization"
      eyebrow={t('venues.detail.business', 'Business')}
      name={venue.organizations.name}
      description={[
        venue.organizations.roles?.includes('publisher')
          ? t('venues.detail.alsoPublishes', 'Also publishes news')
          : null,
        venue.organizations.roles?.includes('seller')
          ? t('venues.detail.alsoSells', 'Also sells online')
          : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      href={`/organizations/${venue.organizations.slug}`}
      actionLabel={t('venues.detail.openBusiness', 'Open business')}
    />
  );
}

/** Spec module 04. Renders for ~6 venues; see the note on `VenueFacts`. */
export function VenueAmenities({ venue }: { venue: VenueWithRelations }) {
  const has =
    (venue.amenities?.length ?? 0) > 0 ||
    (venue.accessibility_attributes?.length ?? 0) > 0 ||
    Boolean(venue.accessibility_notes);
  if (!has) return null;
  return (
    <AmenityDisplay
      amenities={venue.amenities}
      accessibility={venue.accessibility_attributes}
      accessibilityNotes={venue.accessibility_notes}
    />
  );
}

export function VenueWhatsOn({
  venue,
  venueEvents,
}: {
  venue: VenueWithRelations;
  venueEvents: unknown[];
}) {
  if (venueEvents.length === 0) return null;
  return (
    <VenueEvents
      venueId={venue.id}
      venueName={venue.name}
      events={venueEvents as Parameters<typeof VenueEvents>[0]['events']}
      compact={false}
    />
  );
}

export function VenuePhotos({
  venue,
  onContentUpdated,
}: {
  venue: VenueWithRelations;
  onContentUpdated?: () => void;
}) {
  if (!venue.images?.length) return null;
  return (
    <Editable
      contentType="venues"
      recordId={venue.id}
      field="images"
      value={venue.images}
      onSaved={onContentUpdated}
      as="div"
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {venue.images.map((imageUrl, index) => (
          <button
            type="button"
            key={imageUrl}
            className="group block aspect-square w-full overflow-hidden bg-muted p-0"
            onClick={() => window.open(imageUrl, '_blank')}
            aria-label={`Open ${venue.name} photo ${index + 1} in a new tab`}
          >
            <img
              src={imageUrl}
              alt={`${venue.name} ${index + 1}`}
              role="presentation"
              referrerPolicy="no-referrer"
              className="h-full w-full cursor-pointer object-cover"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
          </button>
        ))}
      </div>
    </Editable>
  );
}

/** Guides this venue appears in. Self-hides; kept out of `sections`. */
export function VenueGuides({ venue }: { venue: VenueWithRelations }) {
  return <FeaturedInGuides entityType="venue" entityId={venue.id} />;
}

/**
 * Visitor-reported signals. `bare` — the `SingleSection` around this already
 * renders "Visitor signals" as its h2, so the component's own card title was
 * the same words a second time.
 */
export function VenueSignals({ venue }: { venue: VenueWithRelations }) {
  return <VenueSafetySignalDisplay venueId={venue.id} bare />;
}

export function VenueTags({
  venue,
  onContentUpdated,
}: {
  venue: VenueWithRelations;
  onContentUpdated?: () => void;
}) {
  if (!venue.tags?.length) return null;
  return (
    <Editable
      contentType="venues"
      recordId={venue.id}
      field="tags"
      value={venue.tags}
      onSaved={onContentUpdated}
      as="div"
    >
      <TagChipRow tags={venue.tags} max={TAG_DISPLAY_LIMIT} icon more="expand" />
    </Editable>
  );
}

/* ──────────────────────────── Reviews ─────────────────────────── */

export function VenueReviews({
  reviews,
  averageRating,
}: {
  reviews: VenueReview[];
  averageRating: number;
}) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <Eyebrow as="div">Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}</Eyebrow>
        {averageRating > 0 && (
          <span className="inline-flex items-center gap-1 text-15 font-medium">
            <Star size={14} style={{ fill: 'currentColor' }} aria-hidden="true" />
            {averageRating.toFixed(1)}
          </span>
        )}
      </div>
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No reviews yet. Be the first to share what this place is like.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent>
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex items-center justify-center rounded-full bg-muted text-sm font-semibold"
                      style={{ width: 36, height: 36 }}
                    >
                      {review.profiles?.display_name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {review.profiles?.display_name || 'Anonymous'}
                      </p>
                      <div className="flex items-center" style={{ gap: 1 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={13}
                            style={{
                              fill: i < review.rating ? 'currentColor' : 'none',
                              color:
                                i < review.rating
                                  ? 'hsl(var(--foreground))'
                                  : 'hsl(var(--muted-foreground))',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
                {review.title && <p className="mb-1 text-sm font-semibold">{review.title}</p>}
                {review.content && (
                  <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.6 }}>
                    {review.content}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────── Sidebar ─────────────────────────── */

interface VenueSidebarProps {
  venue: VenueWithRelations;
  checkinRefresh: number;
  onContentUpdated?: () => void;
  /** Other venues + events around this one, rendered as secondary map markers. */
  nearbyPoints?: EntityMapMarker[];
}

/**
 * Location, contact and the map — a body SECTION now, not the rail.
 *
 * The split is the point. Measured on prod, a typical venue put 301px in the
 * 1fr column and 1,028px in the 360px rail: the page's biggest and most
 * useful block (address, contact links, map) was squeezed into the narrow
 * column while the wide one held almost nothing. The rail was not the
 * problem — what was IN it was. This half moves to the body; the small
 * supplementary cards stay in `VenueSidebar` below.
 */
export function VenueLocationContact({
  venue,
  onContentUpdated,
  nearbyPoints = [],
}: VenueSidebarProps) {
  const hasMap = typeof venue.latitude === 'number' && typeof venue.longitude === 'number';
  const hasContact = Boolean(
    venue.address || venue.phone || venue.email || venue.website || venue.instagram,
  );

  if (!hasMap && !hasContact) return null;

  return (
    /* Bare content, no card and no title of its own: this used to be a rail
       card, and it is now the body of a `SingleSection` that already renders
       "Location & contact" as its h2 — the same duplication that made the
       signals section print its heading twice.
       From `lg` the two halves run side by side, so the map sits beside the
       contact details instead of a full-width letterbox above a full-width
       list of four short lines. Below `lg` it stacks as it did in the rail. */
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      {hasMap && (
        // Spec module 16, "Around this station" — REQUIRED on venues.
        // A FRAME around the existing EntityMap, not a second map: the
        // real one already carries clustering, tile loading and the
        // safety-gating that hides venues in criminalising countries
        // from signed-out readers. Re-implementing it here would fork
        // all three.
        <MapInset className="border-0 p-0">
          <EntityMap
            center={[Number(venue.longitude), Number(venue.latitude)]}
            zoom={15}
            height={nearbyPoints.length > 0 ? 220 : 180}
            markers={[
              {
                id: venue.id,
                lat: Number(venue.latitude),
                lng: Number(venue.longitude),
                name: venue.name ?? 'Venue',
                type: 'venues',
                primary: true,
              },
              ...nearbyPoints,
            ]}
          />
          <NearbyMapLegend markers={nearbyPoints} />
        </MapInset>
      )}

      {/* One cell, so the contact lines stay a single column beside the
                map instead of being dealt into the grid one per cell. */}
      <div className="flex min-w-0 flex-col gap-4">
        {venue.address && (
          <div className="flex items-start gap-2">
            <MapPin size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm">
                <Editable
                  contentType="venues"
                  recordId={venue.id}
                  field="address"
                  value={venue.address}
                  onSaved={onContentUpdated}
                  fieldOverride={{ type: 'text' }}
                >
                  {venue.address}
                </Editable>
                {venue.postal_code ? `, ${venue.postal_code}` : ''}
              </p>
            </div>
          </div>
        )}

        {venue.phone && (
          <div className="flex items-center gap-2">
            <Phone size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-sm">
              <Editable
                contentType="venues"
                recordId={venue.id}
                field="phone"
                value={venue.phone}
                onSaved={onContentUpdated}
              >
                <a href={`tel:${venue.phone}`} className="text-primary hover:underline">
                  {formatPhoneDisplay(venue.phone)}
                </a>
              </Editable>
            </span>
          </div>
        )}

        {venue.email && (
          <div className="flex items-center gap-2">
            <Mail size={16} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-sm">
              <Editable
                contentType="venues"
                recordId={venue.id}
                field="email"
                value={venue.email}
                onSaved={onContentUpdated}
              >
                <a href={`mailto:${venue.email}`} className="text-primary hover:underline">
                  {venue.email}
                </a>
              </Editable>
            </span>
          </div>
        )}

        {venue.website && (
          <div className="flex items-center gap-2">
            <Globe size={16} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-sm">
              <Editable
                contentType="venues"
                recordId={venue.id}
                field="website"
                value={venue.website}
                onSaved={onContentUpdated}
              >
                <a
                  href={venue.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-primary hover:underline"
                >
                  {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </Editable>
            </span>
          </div>
        )}

        {venue.instagram && (
          <div className="flex items-center gap-2">
            <Instagram size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-sm">
              <Editable
                contentType="venues"
                recordId={venue.id}
                field="instagram"
                value={venue.instagram}
                onSaved={onContentUpdated}
              >
                <a
                  href={`https://instagram.com/${venue.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  @{venue.instagram}
                </a>
              </Editable>
            </span>
          </div>
        )}

        <EntitySocialLinks links={venue.social_links} exclude={['instagram']} size="sm" />

        {hasMap && (
          <Button variant="outline" size="sm" asChild className="self-start">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation2 size={14} className="mr-1.5" />
              Directions
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * What is left for the 360px rail: the destination safety card, recent
 * check-ins and the correction footnote — small, supplementary, and genuinely
 * rail-shaped.
 *
 * The Hours card that used to live here is GONE, not moved: the descriptor
 * already declares an `hours` section behind the identical
 * `hasUsableHours(venue.hours)` guard, so every venue with hours rendered them
 * twice — once as a section and once as a rail card.
 */
export function VenueSidebar({ venue, checkinRefresh }: VenueSidebarProps) {
  return (
    <div className="flex flex-col gap-6">
      <DestinationSafetyCard countryIds={[venue.country_id]} />

      <VenueRecentCheckins venueId={venue.id} refreshTrigger={checkinRefresh} />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles size={13} aria-hidden="true" />
        Spotted something off? Use the flag in the header to let us know.
      </p>
    </div>
  );
}
