import { CalendarDays, MapPin, Route, Users } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import type { TripWithDetails } from '@/hooks/useTrips';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TripProgressRing } from './TripProgressRing';
import { resolveTripTitle } from './tripTitle';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

interface Props {
  trip: TripWithDetails;
  dateRange: string | null;
  statusLabel: string;
}

function firstTripImage(trip: TripWithDetails): string | null {
  if (isValidImageUrl(trip.cover_image_url)) return trip.cover_image_url;
  for (const place of trip.trip_places) {
    const candidate =
      place.events?.images?.[0] ?? place.hotels?.images?.[0] ?? place.venues?.images?.[0];
    if (isValidImageUrl(candidate)) return candidate;
  }
  return null;
}

export function TripWorkspaceHero({ trip, dateRange, statusLabel }: Props) {
  const { t } = useTranslation();
  const title = resolveTripTitle(trip, t);
  const image = firstTripImage(trip);
  const visibleMembers = trip.trip_members.slice(0, 4);
  const hasStay = trip.trip_places.some((place) => Boolean(place.hotel_id));
  const hasPlan = trip.trip_days.length > 0 && trip.trip_places.length > 0;
  const nextLabel = !trip.start_date
    ? t('trips.workspace.next.dates', 'Start shaping the days')
    : !hasStay
      ? t('trips.workspace.next.stay', 'Choose a place to stay')
      : !hasPlan
        ? t('trips.workspace.next.plan', 'Build the first day')
        : t('trips.workspace.next.continue', 'Continue the plan');
  const nextHref = !hasStay
    ? `/trips/${trip.id}?view=plan&section=prepare`
    : `/trips/${trip.id}?view=plan&section=plan#trip-itinerary`;

  return (
    <header className="relative isolate overflow-hidden rounded-container bg-foreground text-background">
      {image ? (
        <img
          src={image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden="true"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,hsl(var(--muted-foreground)/0.62),transparent_28%),radial-gradient(circle_at_18%_82%,hsl(var(--muted-foreground)/0.42),transparent_32%)]"
        />
      )}
      <div
        className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/25"
        aria-hidden="true"
      />

      {trip.primary_city_name ? (
        <div
          aria-hidden="true"
          className="absolute right-8 top-8 hidden rotate-2 border-2 border-white/55 px-4 py-4 text-center text-white/90 backdrop-blur-sm md:block"
        >
          <span className="block text-3xs font-semibold uppercase tracking-[0.24em]">
            queer.guide
          </span>
          <span className="mt-1 block max-w-36 truncate font-display text-xl uppercase tracking-tight">
            {trip.primary_city_name}
          </span>
        </div>
      ) : null}

      <div className="relative grid min-h-[22rem] items-end gap-8 px-4 pb-6 pt-28 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto] md:px-10 md:pb-8">
        <div className="min-w-0">
          <LocalizedLink
            to="/hub/plans"
            className="mb-6 inline-flex min-h-11 items-center text-sm font-medium text-white/80 no-underline hover:text-white"
          >
            ← {t('trips.backToTrips', 'My trips')}
          </LocalizedLink>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-white/85">
            <span className="rounded-full border border-white/30 bg-black/20 px-4 py-1 backdrop-blur-sm">
              {statusLabel}
            </span>
            {trip.primary_city_name ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {trip.primary_city_name}
              </span>
            ) : null}
          </div>
          <h1 className="max-w-3xl text-balance font-display text-display leading-[0.92] tracking-tight text-white md:text-hero">
            {title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/85">
            {dateRange ? (
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4" aria-hidden />
                {dateRange}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-2">
              <Route className="h-4 w-4" aria-hidden />
              {t('trips.planner.placesCount', { count: trip.trip_places.length })}
            </span>
            {trip.trip_members.length > 0 ? (
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden />
                {t('trips.workspace.travellers', '{{count}} travellers', {
                  count: trip.trip_members.length,
                })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 md:max-w-xs md:justify-end">
          {visibleMembers.length > 0 ? (
            <div
              className="mr-1 flex -space-x-2"
              aria-label={t('trips.workspace.travellerList', 'Trip travellers')}
            >
              {visibleMembers.map((member) => (
                <Avatar key={member.id} className="h-10 w-10 border-2 border-white/70">
                  {member.profiles?.avatar_url ? (
                    <AvatarImage
                      src={member.profiles.avatar_url}
                      alt={member.profiles.display_name ?? ''}
                    />
                  ) : null}
                  <AvatarFallback>
                    {(member.profiles?.display_name ?? 'T').slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          ) : null}
          <div className="rounded-full bg-white p-1 text-foreground shadow-[0_14px_34px_hsl(0_0%_0%/0.28)] ring-4 ring-track-pink">
            <TripProgressRing trip={trip} size={58} />
          </div>
          <LocalizedLink
            to={nextHref}
            className="inline-flex min-h-11 items-center rounded-full bg-white px-6 text-sm font-bold text-black no-underline shadow-[0_12px_28px_hsl(0_0%_0%/0.22)] transition-[transform,box-shadow] duration-normal hover:-translate-y-1 hover:shadow-[0_16px_32px_hsl(0_0%_0%/0.30)] active:translate-y-0"
          >
            {nextLabel} →
          </LocalizedLink>
        </div>
      </div>
    </header>
  );
}
