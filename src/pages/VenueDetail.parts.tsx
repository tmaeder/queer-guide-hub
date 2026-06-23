import {
  Star,
  MapPin,
  Phone,
  Globe,
  Mail,
  Clock,
  Luggage,
  Navigation2,
  Share2,
  ShieldCheck,
  Tag as TagIcon,
  DollarSign,
  Sparkles,
  Newspaper,
  ShoppingBag,
  Building2,
} from 'lucide-react';
import { Instagram } from '@/components/icons/brand';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TagChipRow } from '@/components/tags/TagChipRow';
import { MoreLikeThisByTag } from '@/components/tags/MoreLikeThisByTag';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Image } from '@/components/ui/Image';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import { VenueEvents } from '@/components/venues/VenueEvents';
import { VenueCheckInButton } from '@/components/venues/VenueCheckInButton';
import { VenueRecentCheckins } from '@/components/venues/VenueRecentCheckins';
import { VenueSafetySignalDisplay } from '@/components/venues/VenueSafetySignalDisplay';
import { VenueFeaturedInGuides } from '@/components/venues/VenueFeaturedInGuides';
import { AmenityDisplay } from '@/components/venues/AmenityDisplay';
import { DestinationSafetyCard } from '@/components/safety/DestinationSafetyCard';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import { EntityMap } from '@/components/map/EntityMap';
import { MarkVisitedButton } from '@/components/marks/MarkVisitedButton';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { SocialSignalBadges } from '@/components/trips/SocialSignalBadges';
import { buildPlaceChain } from '@/config/breadcrumbs';
import { useIsMobile } from '@/hooks/use-mobile';
import { getVenueVisual } from '@/lib/venueVisual';
import type { TFunction } from 'i18next';
import type { useVenueSocialSignals } from '@/hooks/useVenueSocialSignals';
import type { Database } from '@/integrations/supabase/types';
import { fetchVenueWithReviews } from '@/hooks/usePageFetchers';

type Venue = Database['public']['Tables']['venues']['Row'];
export type VenueReview = Database['public']['Tables']['venue_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

export type VenueWithRelations = Venue & {
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

export const VENUE_SELECT_FIELDS =
  '*, cities:city_id(id, slug, name), countries:country_id(id, slug, name, equality_score, lgbti_criminalization), organizations:organization_id(slug, name, roles)';

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

export function formatHours(hours: Record<string, unknown>) {
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

  return (
    <div className="flex flex-col gap-2">
      {HOURS_DAYS.map((day, index) => (
        <div key={day} className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-medium">{HOURS_DAY_NAMES[index]}</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {dayMap[day] ?? 'Closed'}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── Hero ───────────────────────────── */

interface VenueHeroProps {
  venue: VenueWithRelations;
  cityName: string | null;
  countryName: string | null;
  cityLink: string | null;
  countryLink: string | null;
  averageRating: number;
  reviewCount: number;
  tripCount?: number;
  isInTrip?: boolean;
  socialSignal: NonNullable<SocialSignals> extends Map<string, infer V> ? V | undefined : undefined;
  onAddToTrip: () => void;
  onShare: () => void;
  onCheckInSuccess: () => void;
  onContentUpdated?: () => void;
  t: (key: string, fallback?: string) => string;
}

function FactCell({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof Star;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-background p-4 ${className ?? ''}`}>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={13} aria-hidden="true" />
        <Eyebrow as="span">{label}</Eyebrow>
      </span>
      <span className="mt-1 block text-15 font-medium">{value}</span>
    </div>
  );
}

export function VenueHero({
  venue,
  cityName,
  countryName,
  cityLink,
  countryLink,
  averageRating,
  reviewCount,
  tripCount,
  isInTrip,
  socialSignal,
  onAddToTrip,
  onShare,
  onCheckInSuccess,
  onContentUpdated,
  t,
}: VenueHeroProps) {
  const isMobile = useIsMobile();
  const isClosed = Boolean(venue.closed_at && new Date(venue.closed_at) <= new Date());
  const openNow = isClosed ? null : getOpenNow(venue.hours);
  const hasFlag = isClosed || venue.is_featured || venue.verified;
  const visual = getVenueVisual(venue);

  // Adaptive fact bar — only cells with real data.
  const facts: Array<{ icon: typeof Star; label: string; value: React.ReactNode }> = [];
  if (venue.category)
    facts.push({ icon: TagIcon, label: 'Type', value: <span className="capitalize">{venue.category}</span> });
  if (venue.price_range)
    facts.push({ icon: DollarSign, label: 'Price', value: getPriceRange(venue.price_range) });
  if (averageRating > 0)
    facts.push({
      icon: Star,
      label: 'Rating',
      value: `${averageRating.toFixed(1)} · ${reviewCount}`,
    });
  if (openNow !== null)
    facts.push({ icon: Clock, label: 'Right now', value: openNow ? 'Open' : 'Closed' });
  const factCols = Math.min(facts.length, 4);
  const factColClass =
    factCols >= 4 ? 'sm:grid-cols-4' : factCols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';

  return (
    <>
      {/* Editorial cover */}
      <div className="group relative mb-6">
        <Image
          src={visual.src}
          fit={visual.fit}
          alt={venue.name}
          heightPx={isMobile ? 220 : 360}
          imageRole="hero"
          rounded="container"
          scrim={!visual.isLogo && hasFlag ? 'readable' : 'none'}
          priority
          fallbackEntityType="venue"
          fallbackKey={venue.id}
        >
          {hasFlag && (
            <div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2">
              {isClosed && <Badge variant="destructive">Permanently closed</Badge>}
              {venue.is_featured && <Badge>Featured</Badge>}
              {venue.verified && (
                <Badge variant="secondary">{t('pages.venueDetail.verified', 'Verified')}</Badge>
              )}
            </div>
          )}
        </Image>
      </div>

      {/* Safety Alert Banner */}
      {venue.countries?.lgbti_criminalization && (
        <SafetyAlertBanner
          criminalization={venue.countries.lgbti_criminalization}
          countryName={venue.countries.name}
        />
      )}

      {/* Permanently closed banner */}
      {isClosed && (
        <div className="mb-6 flex items-center gap-2 bg-destructive px-4 py-4 text-destructive-foreground">
          <p className="text-sm font-semibold">
            Permanently closed
            {' · '}
            {new Date(venue.closed_at!).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      )}

      {/* Editorial header */}
      <div className="mb-6">
        {(venue.category || venue.countries?.equality_score != null) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {venue.category && (
              <Eyebrow as="span" className="capitalize">
                {venue.category}
              </Eyebrow>
            )}
            {venue.countries?.equality_score != null && (
              <EqualityScoreBadge score={venue.countries.equality_score} size="sm" />
            )}
            <SocialSignalBadges signal={socialSignal} tripUsageThreshold={1} />
          </div>
        )}

        <h1
          className="m-0 text-display font-bold leading-[1.05] tracking-tight md:text-headline-lg"
          style={{ overflowWrap: 'anywhere' }}
        >
          <Editable
            contentType="venues"
            recordId={venue.id}
            field="name"
            value={venue.name}
            onSaved={onContentUpdated}
          >
            {venue.name}
          </Editable>
        </h1>

        {(cityName || venue.address) && (
          <div className="mt-4 flex items-center gap-1.5 text-body-lg text-muted-foreground">
            <MapPin size={16} className="shrink-0" aria-hidden="true" />
            <span>
              {cityLink ? (
                <LocalizedLink to={cityLink} className="hover:underline">
                  {cityName}
                </LocalizedLink>
              ) : (
                cityName
              )}
              {countryName && (
                <>
                  {cityName ? ', ' : ''}
                  {countryLink ? (
                    <LocalizedLink to={countryLink} className="hover:underline">
                      {countryName}
                    </LocalizedLink>
                  ) : (
                    countryName
                  )}
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Fact bar */}
      {facts.length > 0 && (
        <div
          className={`mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-element border border-border bg-border ${factColClass}`}
        >
          {facts.map((f, i) => (
            <FactCell
              key={f.label}
              icon={f.icon}
              label={f.label}
              value={f.value}
              // Odd count leaves an empty cell on the 2-col mobile grid — let
              // the last fact fill the row. Resets to a single column at sm+.
              className={
                facts.length % 2 === 1 && i === facts.length - 1
                  ? 'col-span-2 sm:col-span-1'
                  : ''
              }
            />
          ))}
        </div>
      )}

      {/* Actions — one primary, the rest quiet */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {!isClosed && (
          <Button onClick={onAddToTrip}>
            <Luggage size={16} className="mr-2" />
            Add to trip
          </Button>
        )}
        <FavoriteButton itemId={venue.id} type="venue" size="md" />
        {isInTrip && (
          <Badge variant="soft">
            In {tripCount} trip{tripCount !== 1 ? 's' : ''}
          </Badge>
        )}
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
              Website
            </a>
          </Button>
        )}
        {typeof venue.latitude === 'number' && typeof venue.longitude === 'number' && (
          <Button variant="outline" size="sm" asChild>
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
        <Button variant="outline" size="sm" onClick={onShare}>
          <Share2 size={14} className="mr-1.5" />
          Share
        </Button>
        <MarkVisitedButton entityType="venue" entityId={venue.id} kind="visited" />
        <ReportButton contentType="venues" contentId={venue.id} contentName={venue.name} />
        <AdminEditButton
          contentType="venues"
          contentId={venue.id}
          contentName={venue.name}
          currentData={venue as Record<string, unknown>}
          onSaved={() => window.location.reload()}
        />
      </div>
    </>
  );
}

/* ─────────────────────────── Overview ─────────────────────────── */

interface VenueOverviewProps {
  venue: VenueWithRelations;
  reviews: VenueReview[];
  venueEvents: Array<{ id: string; venue_id?: string | null }>;
  averageRating: number;
  onContentUpdated?: () => void;
  t: (key: string, fallback?: string) => string;
}

export function VenueOverview({
  venue,
  reviews,
  venueEvents,
  averageRating,
  onContentUpdated,
  t,
}: VenueOverviewProps) {
  const hasAmenities =
    (venue.amenities?.length ?? 0) > 0 ||
    (venue.accessibility_attributes?.length ?? 0) > 0 ||
    Boolean(venue.accessibility_notes);
  const hasImages = (venue.images?.length ?? 0) > 0;
  const hasTags = (venue.tags?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-10">
      <VenueFeaturedInGuides venueId={venue.id} />

      {venue.organizations && (
        <LocalizedLink
          to={`/organizations/${venue.organizations.slug}`}
          className="flex items-center gap-2 rounded-element border border-border p-4 transition-colors hover:bg-muted"
        >
          <Building2 size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Part of {venue.organizations.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
              {venue.organizations.roles?.includes('publisher') && (
                <span className="inline-flex items-center gap-1">
                  <Newspaper size={13} aria-hidden="true" /> Also publishes news
                </span>
              )}
              {venue.organizations.roles?.includes('seller') && (
                <span className="inline-flex items-center gap-1">
                  <ShoppingBag size={13} aria-hidden="true" /> Also sells online
                </span>
              )}
            </div>
          </div>
        </LocalizedLink>
      )}

      {venue.description && (
        <section>
          <Eyebrow as="div" className="mb-2">
            {t('pages.venueDetail.about', 'About')}
          </Eyebrow>
          <Editable
            contentType="venues"
            recordId={venue.id}
            field="description"
            value={venue.description}
            onSaved={onContentUpdated}
            fieldOverride={{ type: 'textarea' }}
            as="div"
          >
            <p
              className="max-w-[68ch] whitespace-pre-wrap text-body-lg text-foreground/90"
              style={{ lineHeight: 1.7 }}
            >
              {venue.description}
            </p>
          </Editable>
        </section>
      )}

      {hasTags && (
        <Editable
          contentType="venues"
          recordId={venue.id}
          field="tags"
          value={venue.tags}
          onSaved={onContentUpdated}
          as="div"
        >
          <TagChipRow tags={venue.tags!} max={TAG_DISPLAY_LIMIT} icon more="expand" />
        </Editable>
      )}

      {hasAmenities && (
        <AmenityDisplay
          amenities={venue.amenities}
          accessibility={venue.accessibility_attributes}
          accessibilityNotes={venue.accessibility_notes}
        />
      )}

      {venueEvents.length > 0 && (
        <section>
          <Eyebrow as="div" className="mb-4">
            What's on here
          </Eyebrow>
          <VenueEvents
            venueId={venue.id}
            venueName={venue.name}
            events={venueEvents as Parameters<typeof VenueEvents>[0]['events']}
            compact={false}
          />
        </section>
      )}

      <section>
        <Eyebrow as="div" className="mb-2 flex items-center gap-1.5">
          <ShieldCheck size={13} aria-hidden="true" />
          Visitor signals
        </Eyebrow>
        <VenueSafetySignalDisplay venueId={venue.id} />
      </section>

      <VenueReviews reviews={reviews} averageRating={averageRating} />

      {hasImages && (
        <section>
          <Eyebrow as="div" className="mb-4">
            Photos
          </Eyebrow>
          <Editable
            contentType="venues"
            recordId={venue.id}
            field="images"
            value={venue.images}
            onSaved={onContentUpdated}
            as="div"
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {venue.images!.map((imageUrl, index) => (
                <button
                  type="button"
                  key={index}
                  className="group block aspect-square w-full overflow-hidden rounded-element border-0 bg-muted p-0"
                  onClick={() => window.open(imageUrl, '_blank')}
                  aria-label={`Open ${venue.name} photo ${index + 1} in a new tab`}
                >
                  <img
                    src={imageUrl}
                    alt={`${venue.name} ${index + 1}`}
                    role="presentation"
                    referrerPolicy="no-referrer"
                    className="h-full w-full cursor-pointer object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                </button>
              ))}
            </div>
          </Editable>
        </section>
      )}

      <MoreLikeThisByTag entityType="venue" entityId={venue.id} />
    </div>
  );
}

/* ──────────────────────────── Reviews ─────────────────────────── */

function VenueReviews({
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
}

export function VenueSidebar({ venue, checkinRefresh, onContentUpdated }: VenueSidebarProps) {
  const hasMap = typeof venue.latitude === 'number' && typeof venue.longitude === 'number';
  const openNow = getOpenNow(venue.hours);
  const hasContact = Boolean(
    venue.address || venue.phone || venue.email || venue.website || venue.instagram,
  );

  return (
    <div className="flex flex-col gap-6">
      {(hasMap || hasContact) && (
        <Card>
          <CardHeader>
            <CardTitle>Location & contact</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {hasMap && (
              <EntityMap
                center={[Number(venue.longitude), Number(venue.latitude)]}
                zoom={15}
                height={180}
                markers={[
                  {
                    id: venue.id,
                    lat: Number(venue.latitude),
                    lng: Number(venue.longitude),
                    name: venue.name ?? 'Venue',
                    type: 'venues',
                    primary: true,
                  },
                ]}
              />
            )}

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
                      {venue.phone}
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
          </CardContent>
        </Card>
      )}

      {hasUsableHours(venue.hours) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Clock size={16} />
                Hours
              </span>
              {openNow !== null && (
                <Badge variant={openNow ? 'soft' : 'outline'}>{openNow ? 'Open now' : 'Closed'}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Editable
              contentType="venues"
              recordId={venue.id}
              field="hours"
              value={venue.hours}
              onSaved={onContentUpdated}
              as="div"
            >
              {formatHours(venue.hours as Record<string, unknown>)}
            </Editable>
          </CardContent>
        </Card>
      )}

      <DestinationSafetyCard countryIds={[venue.country_id]} />

      <VenueRecentCheckins venueId={venue.id} refreshTrigger={checkinRefresh} />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles size={13} aria-hidden="true" />
        Spotted something off? Use the flag in the header to let us know.
      </p>
    </div>
  );
}
