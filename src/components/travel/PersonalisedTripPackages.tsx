import { useMemo, useState } from 'react';
import { addDays, addMonths, format, nextFriday, startOfDay } from 'date-fns';
import {
  ArrowRight,
  BedDouble,
  Bike,
  Bus,
  CalendarDays,
  Car,
  CarTaxiFront,
  Footprints,
  Hotel,
  MapPin,
  Plane,
  Ship,
  Sparkles,
  Train,
  TramFront,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardImage } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { CarRentalSection } from '@/components/travel/CarRentalSection';
import { TransferSection } from '@/components/travel/TransferSection';
import { useAuth } from '@/hooks/useAuth';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useOptionalActiveTrip } from '@/hooks/useActiveTrip';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';
import { useTripTemplates, type TripTemplate } from '@/hooks/useTripTemplates';
import { buildFlixbusUrl } from '@/utils/transport/flixbusUrl';
import { buildOmioUrl } from '@/utils/transport/omioUrl';
import { buildTrainlineUrl } from '@/utils/transport/trainlineUrl';
import type { HotelTypeOption } from '@/components/booking/HotelSearchForm';
import type { TransportMode } from '@/components/trips/tripLegs';

type Mood = 'nightlife' | 'slow' | 'pride' | 'culture' | 'outdoors';
type Timing = 'weekend' | 'month' | 'flexible';
type Budget = 'easy' | 'comfortable' | 'special';

const MOODS: Array<{ value: Mood; label: string; hint: string }> = [
  { value: 'nightlife', label: 'Big nights', hint: 'Clubs, bars and late starts' },
  { value: 'slow', label: 'Soft & romantic', hint: 'Cafés, spas and unhurried days' },
  { value: 'pride', label: 'Pride energy', hint: 'A trip anchored by a real event' },
  { value: 'culture', label: 'Culture & community', hint: 'Local stories and queer spaces' },
  { value: 'outdoors', label: 'Outside, please', hint: 'Water, trails and fresh air' },
];

const TIMINGS: Array<{ value: Timing; label: string }> = [
  { value: 'weekend', label: 'This weekend' },
  { value: 'month', label: 'Next month' },
  { value: 'flexible', label: 'Surprise me' },
];

const BUDGETS: Array<{ value: Budget; label: string }> = [
  { value: 'easy', label: 'Easy on the wallet' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'special', label: 'Make it special' },
];

const STAY_TYPES: Array<{ value: HotelTypeOption; label: string }> = [
  { value: 'hotel', label: 'Hotels' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'bnb', label: 'B&Bs' },
  { value: 'apartment', label: 'Apartments' },
  { value: 'hostel', label: 'Hostels' },
];

const ARRIVAL_MODES: Array<{
  value: TransportMode;
  label: string;
  icon: typeof Plane;
  note: string;
}> = [
  { value: 'flight', label: 'Fly', icon: Plane, note: 'Live fare search' },
  { value: 'rail', label: 'Train', icon: Train, note: 'Trainline + Omio' },
  { value: 'transit', label: 'Coach', icon: Bus, note: 'Omio + FlixBus' },
  { value: 'ferry', label: 'Ferry', icon: Ship, note: 'Add the sailing as a leg' },
  { value: 'drive', label: 'Drive', icon: Car, note: 'Car hire at destination' },
];

const LOCAL_MODES = [
  { label: 'Public transit', icon: TramFront },
  { label: 'Taxi / rideshare', icon: CarTaxiFront },
  { label: 'Cycling', icon: Bike },
  { label: 'Walking', icon: Footprints },
];

function datesFor(timing: Timing, days: number) {
  const today = startOfDay(new Date());
  const start = timing === 'weekend' ? nextFriday(today) : addMonths(today, 1);
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(addDays(start, Math.max(1, days - 1)), 'yyyy-MM-dd'),
  };
}

function scoreTemplate(template: TripTemplate, mood: Mood, timing: Timing) {
  let score = 0;
  if (mood === 'pride' && template.source === 'event') score += 10;
  if (mood === 'nightlife' && template.vibe === 'nightlife') score += 9;
  if (mood === 'slow' && template.vibe === 'slow') score += 9;
  if (mood === 'outdoors' && template.vibe === 'outdoors') score += 9;
  if (mood === 'culture' && template.vibe === 'community') score += 9;
  if (timing === 'weekend' && template.days <= 4) score += 3;
  if (timing === 'month' && template.source === 'event') score += 2;
  if (template.coverImageUrl) score += 1;
  return score;
}

function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-4 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-element border px-4 py-2 text-left transition-colors ${
              value === option.value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background hover:border-foreground/50'
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            {option.hint ? (
              <span
                className={`block text-xs ${value === option.value ? 'text-background/70' : 'text-muted-foreground'}`}
              >
                {option.hint}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function PersonalisedTripPackages() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const activeTripContext = useOptionalActiveTrip();
  const { createTrip, addPlacesBulk } = useTripMutations();
  const { data: templates, isLoading } = useTripTemplates();
  const [mood, setMood] = useState<Mood>('nightlife');
  const [timing, setTiming] = useState<Timing>('weekend');
  const [budget, setBudget] = useState<Budget>('comfortable');
  const [stayType, setStayType] = useState<HotelTypeOption>('hotel');
  const [arrivalMode, setArrivalMode] = useState<TransportMode>('rail');
  const [origin, setOrigin] = useState('');

  const ranked = useMemo(
    () =>
      [...(templates ?? [])].sort(
        (a, b) => scoreTemplate(b, mood, timing) - scoreTemplate(a, mood, timing),
      ),
    [templates, mood, timing],
  );
  const best = ranked[0];
  const dates = best ? datesFor(timing, best.days) : null;
  const priceMax = budget === 'easy' ? 140 : budget === 'comfortable' ? 300 : undefined;
  const { data: stays, isLoading: staysLoading } = useHotelSearch({
    city: best?.cities,
    checkIn: dates?.start,
    checkOut: dates?.end,
    guests: 2,
    hotelType: stayType,
    priceMax,
    limit: 3,
    enabled: !!best,
  });
  const bookableStays = (stays ?? []).filter((stay) => Boolean(stay.bookingUrl)).slice(0, 3);

  const bookingUrl = (tab: 'flights' | 'hotels', type?: HotelTypeOption) => {
    if (!best || !dates) return '/travel?intent=book';
    const params = new URLSearchParams({
      tab,
      city: best.cities,
      checkIn: dates.start,
      checkOut: dates.end,
      guests: '2',
    });
    if (type) params.set('type', type);
    if (tab === 'flights') params.set('to', best.cities);
    return `/travel?${params.toString()}`;
  };

  const handleCreate = (template: TripTemplate) => {
    if (!user) {
      navigate('/auth?redirect=/travel');
      return;
    }
    const tripDates = datesFor(timing, template.days);
    createTrip.mutate(
      {
        title: template.title,
        start_date: tripDates.start,
        end_date: tripDates.end,
        currency: template.currency,
        cover_image_url: template.coverImageUrl ?? undefined,
        primary_city_id: template.primaryCityId,
        primary_country_id: template.primaryCountryId,
      },
      {
        onSuccess: async (trip) => {
          activeTripContext?.setActiveTripId(trip.id);
          try {
            await addPlacesBulk.mutateAsync({
              tripId: trip.id,
              rows: template.cityIds.map((cityId, index) => ({
                day_id: null,
                venue_id: null,
                event_id: index === 0 ? (template.event?.id ?? null) : null,
                hotel_id: null,
                custom_name: null,
                custom_address: null,
                latitude: null,
                longitude: null,
                city_id: cityId,
                country_id: template.primaryCountryId,
                start_time: null,
                end_time: null,
                duration_minutes: null,
                notes: null,
                category: index === 0 && template.event ? 'event' : 'city',
                sort_order: index,
                icon: null,
                arrive_mode: index === 0 ? arrivalMode : null,
              })),
            });
          } catch (error) {
            console.warn('[PersonalisedTripPackages] trip seed failed', error);
          }
          toast({
            title: t('travel.packages.created', 'Your trip is ready to shape'),
            description: t(
              'travel.packages.createdDescription',
              'The destination, anchor event and arrival mode are already in place.',
            ),
          });
          navigate(`/trips/${trip.id}`);
        },
        onError: (error) =>
          toast({
            title: 'Could not create the trip',
            description: error.message,
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <section aria-labelledby="personalised-packages-title" className="space-y-8">
      <div className="max-w-3xl">
        <Badge variant="outline" className="mb-4">
          <Sparkles className="mr-1 h-3.5 w-3.5" /> Personalised escapes
        </Badge>
        <h2 id="personalised-packages-title" className="text-display-sm font-bold tracking-tight">
          What kind of escape do you need?
        </h2>
        <p className="mt-4 text-body-lg text-muted-foreground">
          Start with a complete idea—not a blank form. These verified picks already connect the
          destination, events, queer places, stays and transport.
        </p>
      </div>

      {isLoading && !best ? (
        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.8fr]">
          <Skeleton variant="rectangular" className="h-[460px] rounded-container" />
          <div className="grid gap-6">
            <Skeleton variant="rectangular" className="h-[220px] rounded-container" />
            <Skeleton variant="rectangular" className="h-[220px] rounded-container" />
          </div>
        </div>
      ) : best ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.45fr_0.8fr]">
            <Card className="overflow-hidden">
              <div className="relative">
                <CardImage
                  src={best.coverImageUrl}
                  alt={`${best.cities} travel inspiration`}
                  height={420}
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                  <Badge variant="outline" className="mb-4">
                    Your best match
                  </Badge>
                  <h3 className="max-w-2xl text-headline font-bold">{best.title}</h3>
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/85">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={15} /> {best.cities}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={15} /> {best.days} days
                    </span>
                    {best.event ? <span>{best.event.title}</span> : null}
                    {best.venueCount ? <span>{best.venueCount} matched places</span> : null}
                  </p>
                  <Button
                    className="mt-6"
                    onClick={() => handleCreate(best)}
                    disabled={createTrip.isPending}
                  >
                    {createTrip.isPending ? <TrackLoader size={16} /> : null}
                    Build this escape <ArrowRight />
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
              {ranked.slice(1, 3).map((template) => (
                <Card key={template.id} className="overflow-hidden">
                  <CardImage
                    src={template.coverImageUrl}
                    alt={`${template.cities} travel inspiration`}
                    height={150}
                  />
                  <div className="p-6">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {template.source === 'event' ? 'Event-led escape' : 'Another match'}
                    </p>
                    <h3 className="mt-1 text-lg font-bold">{template.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {template.cities} · {template.days} days
                    </p>
                    <Button
                      variant="ghost"
                      className="mt-4 px-0"
                      onClick={() => handleCreate(template)}
                    >
                      Choose this one <ArrowRight />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <Card className="p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Make it yours
              </p>
              <h3 className="mt-1 text-title font-bold">Three quick choices reshuffle the picks</h3>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <ChipGroup label="1. Pick a mood" value={mood} options={MOODS} onChange={setMood} />
              <ChipGroup label="2. When?" value={timing} options={TIMINGS} onChange={setTiming} />
              <ChipGroup
                label="3. What feels right?"
                value={budget}
                options={BUDGETS}
                onChange={setBudget}
              />
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Events & places
                  </p>
                  <h3 className="mt-1 text-title font-bold">
                    A trip with something to look forward to
                  </h3>
                </div>
                <Sparkles className="text-primary" />
              </div>
              <div className="mt-6 space-y-4">
                {best.event ? (
                  <LocalizedLink
                    to={`/events/${best.event.slug}`}
                    className="block rounded-element bg-surface-container p-4 no-underline hover:bg-muted"
                  >
                    <span className="block text-xs font-bold uppercase text-muted-foreground">
                      Anchor event
                    </span>
                    <span className="mt-1 block font-bold">{best.event.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {best.event.startDate}
                    </span>
                  </LocalizedLink>
                ) : best.reason ? (
                  <div className="rounded-element bg-surface-container p-4">
                    <span className="block text-xs font-bold uppercase text-muted-foreground">
                      Why it fits
                    </span>
                    <span className="mt-1 block font-bold">{best.reason}</span>
                  </div>
                ) : null}
                <LocalizedLink
                  to={`/venues?city=${encodeURIComponent(best.cities)}`}
                  className="flex min-h-12 items-center justify-between rounded-element bg-surface-container p-4 font-semibold no-underline hover:bg-muted"
                >
                  Browse queer venues in {best.cities} <ArrowRight />
                </LocalizedLink>
                <LocalizedLink
                  to={`/events?city=${encodeURIComponent(best.cities)}`}
                  className="flex min-h-12 items-center justify-between rounded-element bg-surface-container p-4 font-semibold no-underline hover:bg-muted"
                >
                  See more events <ArrowRight />
                </LocalizedLink>
              </div>
            </Card>

            <Card className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Hotels, B&Bs & more
              </p>
              <h3 className="mt-1 text-title font-bold">Stay your way</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {STAY_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    aria-pressed={stayType === type.value}
                    onClick={() => setStayType(type.value)}
                    className={`rounded-element border px-4 py-2 text-sm font-semibold ${
                      stayType === type.value
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
              <div className="mt-6 grid gap-4">
                {staysLoading ? (
                  <Skeleton variant="rectangular" className="h-24 rounded-element" />
                ) : bookableStays.length ? (
                  bookableStays.map((stay) => (
                    <a
                      key={stay.id}
                      href={stay.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="grid grid-cols-[72px_1fr_auto] items-center gap-4 rounded-element bg-surface-container p-4 no-underline hover:bg-muted"
                    >
                      {stay.imageUrl ? (
                        <img
                          src={stay.imageUrl}
                          alt=""
                          className="h-16 w-[72px] rounded-element object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid h-16 w-[72px] place-items-center rounded-element bg-muted">
                          <BedDouble />
                        </div>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{stay.title}</span>
                        <span className="block text-xs text-muted-foreground">Live result</span>
                      </span>
                      <span className="text-sm font-bold">
                        {stay.currency} {Math.round(stay.price)}
                      </span>
                    </a>
                  ))
                ) : (
                  <p className="rounded-element bg-surface-container p-4 text-sm text-muted-foreground">
                    No verified live result yet. Open the full search to compare availability.
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => navigate(bookingUrl('hotels', stayType))}
              >
                <Hotel /> Compare all {STAY_TYPES.find((type) => type.value === stayType)?.label}
              </Button>
            </Card>
          </div>

          <Card className="p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Door to door
            </p>
            <h3 className="mt-1 text-title font-bold">Choose how you want to move</h3>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              We only show live provider links when the route inputs exist. Your chosen arrival mode
              is saved with the trip; local modes stay available for every itinerary leg.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {ARRIVAL_MODES.map(({ value, label, icon: Icon, note }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={arrivalMode === value}
                  onClick={() => setArrivalMode(value)}
                  className={`rounded-element border p-4 text-left ${arrivalMode === value ? 'border-foreground bg-foreground text-background' : 'border-border bg-background'}`}
                >
                  <Icon />
                  <span className="mt-4 block font-bold">{label}</span>
                  <span
                    className={`mt-1 block text-xs ${arrivalMode === value ? 'text-background/70' : 'text-muted-foreground'}`}
                  >
                    {note}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <label htmlFor="package-origin" className="text-sm font-bold">
                  Starting from
                </label>
                <Input
                  id="package-origin"
                  className="mt-2"
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                  placeholder="Your city"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate(bookingUrl('flights'))}>
                    <Plane /> Flights
                  </Button>
                  {origin ? (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={buildTrainlineUrl({
                          origin,
                          destination: best.cities,
                          departDate: dates?.start,
                          returnDate: dates?.end,
                        })}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        <Train /> Trains
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <Train /> Trains
                    </Button>
                  )}
                  {origin ? (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={buildOmioUrl({
                          origin,
                          destination: best.cities,
                          departDate: dates?.start,
                          returnDate: dates?.end,
                        })}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        <Bus /> Rail + coach
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <Bus /> Rail + coach
                    </Button>
                  )}
                  {origin ? (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={buildFlixbusUrl({
                          origin,
                          destination: best.cities,
                          departDate: dates?.start,
                        })}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        <Bus /> Coaches
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <Bus /> Coaches
                    </Button>
                  )}
                </div>
                {!origin ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Add an origin to unlock route-specific rail and coach searches.
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-sm font-bold">Around {best.cities}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {LOCAL_MODES.map(({ label, icon: Icon }) => (
                    <div key={label} className="rounded-element bg-surface-container p-4">
                      <Icon size={18} />
                      <span className="mt-2 block text-sm font-semibold">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <CarRentalSection
                city={best.cities}
                checkIn={dates?.start}
                checkOut={dates?.end}
                compact
              />
              <TransferSection city={best.cities} compact />
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-8 text-center">
          <h3 className="text-title font-bold">Fresh packages are on their way</h3>
          <p className="mt-2 text-muted-foreground">
            We could not verify enough destination data to recommend one safely right now.
          </p>
        </Card>
      )}
    </section>
  );
}
