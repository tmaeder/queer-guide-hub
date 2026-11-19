import { useMemo, useState } from 'react';
import { addDays, addMonths, format, nextFriday, startOfDay } from 'date-fns';
import {
  ArrowRight,
  BedDouble,
  Bus,
  CalendarDays,
  Compass,
  CalendarRange,
  Coffee,
  Crown,
  Flag,
  Flame,
  Heart,
  Mountain,
  Music,
  Shuffle,
  Users,
  Wallet,
  Bed,
  Building2,
  Car,
  Hotel,
  MapPin,
  Plane,
  Ship,
  Sparkles,
  Train,
} from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardImage } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FilterChip } from '@/components/transit/FilterChip';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { CarRentalSection } from '@/components/travel/CarRentalSection';
import { TransferSection } from '@/components/travel/TransferSection';
import { InlineCitySearch } from '@/components/travel/InlineCitySearch';
import { QueerGuideStays } from '@/components/travel/QueerGuideStays';
import { InlineFlightDeals } from '@/components/travel/InlineFlightDeals';
import { useAuth } from '@/hooks/useAuth';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useOptionalActiveTrip } from '@/hooks/useActiveTrip';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';
import { useTripTemplates, type TripTemplate } from '@/hooks/useTripTemplates';
import { buildFlixbusUrl } from '@/utils/transport/flixbusUrl';
import { buildTrainlineUrl } from '@/utils/transport/trainlineUrl';
import type { HotelTypeOption } from '@/components/booking/HotelSearchForm';
import type { TransportMode } from '@/components/trips/tripLegs';

type Mood = 'nightlife' | 'slow' | 'pride' | 'kinky' | 'culture' | 'outdoors';
type Timing = 'weekend' | 'month' | 'flexible' | 'custom';
type Budget = 'easy' | 'comfortable' | 'special';

const MOODS: Array<{ value: Mood; label: string; hint: string; icon: typeof Plane }> = [
  { value: 'nightlife', label: 'Big nights', hint: 'Clubs, bars and late starts', icon: Music },
  { value: 'slow', label: 'Soft & romantic', hint: 'Cafés, spas and unhurried days', icon: Heart },
  { value: 'pride', label: 'Pride energy', hint: 'A trip anchored by a real event', icon: Flag },
  {
    value: 'kinky',
    label: 'Kinky',
    hint: 'Folsom, Darklands, Easter Berlin and more',
    icon: Flame,
  },
  {
    value: 'culture',
    label: 'Culture & community',
    hint: 'Local stories and queer spaces',
    icon: Users,
  },
  {
    value: 'outdoors',
    label: 'Outside, please',
    hint: 'Water, trails and fresh air',
    icon: Mountain,
  },
];

const TIMINGS: Array<{ value: Timing; label: string; icon: typeof Plane }> = [
  { value: 'weekend', label: 'This weekend', icon: CalendarDays },
  { value: 'month', label: 'Next month', icon: CalendarRange },
  { value: 'flexible', label: 'Surprise me', icon: Shuffle },
  { value: 'custom', label: 'Pick dates', icon: CalendarRange },
];

const BUDGETS: Array<{ value: Budget; label: string; icon: typeof Plane }> = [
  { value: 'easy', label: 'Easy on the wallet', icon: Wallet },
  { value: 'comfortable', label: 'Comfortable', icon: BedDouble },
  { value: 'special', label: 'Make it special', icon: Crown },
];

const STAY_TYPES: Array<{ value: HotelTypeOption; label: string; icon: typeof Plane }> = [
  { value: 'hotel', label: 'Hotels', icon: Hotel },
  { value: 'boutique', label: 'Boutique', icon: Sparkles },
  { value: 'bnb', label: 'B&Bs', icon: Coffee },
  { value: 'apartment', label: 'Apartments', icon: Building2 },
  { value: 'hostel', label: 'Hostels', icon: Bed },
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

function datesFor(timing: Timing, days: number, custom?: { start: string; end: string }) {
  if (timing === 'custom' && custom?.start) {
    return { start: custom.start, end: custom.end || custom.start };
  }
  const today = startOfDay(new Date());
  const start = timing === 'weekend' ? nextFriday(today) : addMonths(today, 1);
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(addDays(start, Math.max(1, days - 1)), 'yyyy-MM-dd'),
  };
}

function scoreTemplate(template: TripTemplate, mood: Mood, timing: Timing) {
  let score = 0;
  // Kink weekends lead only when asked for, and never surface otherwise.
  if (template.theme === 'kink') return mood === 'kinky' ? 20 : -20;
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
  options: Array<{ value: T; label: string; hint?: string; icon?: typeof Plane }>;
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
            className={`flex min-h-11 items-center gap-2.5 rounded-element px-4 py-2 text-left transition-colors ${
              value === option.value
                ? 'bg-foreground text-background'
                : 'bg-card shadow-soft hover:bg-muted'
            }`}
          >
            {option.icon ? <option.icon size={18} aria-hidden className="shrink-0" /> : null}
            <span>
              <span className="block text-sm font-semibold">{option.label}</span>
              {option.hint ? (
                <span
                  className={`block text-xs ${value === option.value ? 'text-background/70' : 'text-muted-foreground'}`}
                >
                  {option.hint}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function StepHeading({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-4">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-sm font-bold text-background"
        aria-hidden
      >
        {n}
      </span>
      <div>
        <h3 className="text-title font-bold">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function PackagePart({
  icon: Icon,
  kicker,
  title,
}: {
  icon: typeof Plane;
  kicker: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted"
        aria-hidden
      >
        <Icon size={20} />
      </span>
      <div>
        <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">{kicker}</p>
        <h4 className="text-lg font-bold">{title}</h4>
      </div>
    </div>
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
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [travellers, setTravellers] = useState(2);
  const [budget, setBudget] = useState<Budget>('comfortable');
  const [stayType, setStayType] = useState<HotelTypeOption>('hotel');
  const [arrivalMode, setArrivalMode] = useState<TransportMode>('rail');
  // Prefilled from the visitor's detected city until they type their own.
  const { originCity } = useVisitorOrigin();
  const [originInput, setOrigin] = useState<string | null>(null);
  const origin = originInput ?? originCity ?? '';

  const [place, setPlace] = useState<string | null>(null);
  const places = useMemo(() => {
    const seen = new Map<string, number>();
    for (const tpl of templates ?? []) {
      if (tpl.theme === 'kink' && mood !== 'kinky') continue;
      const city = tpl.cities.split(',')[0]?.trim();
      if (city) seen.set(city, (seen.get(city) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([c]) => c);
  }, [templates, mood]);

  const ranked = useMemo(
    () =>
      [...(templates ?? [])]
        .filter((tpl) => mood === 'kinky' || tpl.theme !== 'kink')
        .filter((tpl) => !place || tpl.cities.toLowerCase().includes(place.toLowerCase()))
        .sort((a, b) => scoreTemplate(b, mood, timing) - scoreTemplate(a, mood, timing)),
    [templates, mood, timing, place],
  );
  const best = ranked[0];
  // A trip built around an event runs on the event's dates, not the timing chip.
  const dates = best
    ? best.event && timing !== 'custom'
      ? {
          start: best.event.startDate,
          end: format(addDays(new Date(best.event.startDate), best.days - 1), 'yyyy-MM-dd'),
        }
      : datesFor(timing, best.days, customDates)
    : null;
  const priceMax = budget === 'easy' ? 140 : budget === 'comfortable' ? 300 : undefined;
  const { data: stays, isLoading: staysLoading } = useHotelSearch({
    city: best?.cities,
    checkIn: dates?.start,
    checkOut: dates?.end,
    guests: travellers,
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
      guests: String(travellers),
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
    const tripDates = datesFor(timing, template.days, customDates);
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
    <section aria-label="Trip packages" className="space-y-8">
      <p className="max-w-3xl text-body-lg text-muted-foreground">
        Pick a mood, then check the package: one destination with its event, places, stay and way to
        get there. Build it into a trip in one step.
      </p>

      <Card className="p-6 sm:p-8">
        <StepHeading
          n={1}
          title="Tell us the mood"
          hint="A few quick choices reshuffle the pick."
        />
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <ChipGroup label="Mood" value={mood} options={MOODS} onChange={setMood} />
          <div className="flex flex-col gap-4">
            <ChipGroup label="When?" value={timing} options={TIMINGS} onChange={setTiming} />
            {timing === 'custom' && (
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1.5 text-sm font-medium">
                  <label htmlFor="trip-custom-start">From</label>
                  <Input
                    id="trip-custom-start"
                    type="date"
                    value={customDates.start}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setCustomDates((d) => ({ ...d, start: e.target.value }))}
                    className="w-44"
                  />
                </div>
                <div className="flex flex-col gap-1.5 text-sm font-medium">
                  <label htmlFor="trip-custom-end">To</label>
                  <Input
                    id="trip-custom-end"
                    type="date"
                    value={customDates.end}
                    min={customDates.start || format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setCustomDates((d) => ({ ...d, end: e.target.value }))}
                    className="w-44"
                  />
                </div>
              </div>
            )}
          </div>
          <ChipGroup label="Budget" value={budget} options={BUDGETS} onChange={setBudget} />
          {places.length > 1 && (
            <fieldset>
              <legend className="mb-4 text-sm font-bold">
                Where <span className="font-normal text-muted-foreground">(optional)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  active={place === null}
                  onClick={() => setPlace(null)}
                  label={
                    <>
                      <Compass size={14} aria-hidden /> Anywhere
                    </>
                  }
                />
                {places.map((c) => (
                  <FilterChip
                    key={c}
                    active={place === c}
                    onClick={() => setPlace(place === c ? null : c)}
                    label={
                      <>
                        <MapPin size={14} aria-hidden /> {c}
                      </>
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className="mb-4 text-sm font-bold">
              Travellers <span className="font-normal text-muted-foreground">(optional)</span>
            </legend>
            <div className="inline-flex items-center gap-1 rounded-element bg-card p-1 shadow-soft">
              <button
                type="button"
                onClick={() => setTravellers((n) => Math.max(1, n - 1))}
                disabled={travellers <= 1}
                aria-label="One traveller fewer"
                className="grid size-11 place-items-center rounded-element text-title font-bold hover:bg-muted disabled:opacity-40"
              >
                −
              </button>
              <span
                className="inline-flex min-w-24 items-center justify-center gap-2 text-15 font-bold tabular-nums"
                aria-live="polite"
              >
                <Users size={16} aria-hidden />
                {travellers} {travellers === 1 ? 'person' : 'people'}
              </span>
              <button
                type="button"
                onClick={() => setTravellers((n) => Math.min(9, n + 1))}
                disabled={travellers >= 9}
                aria-label="One traveller more"
                className="grid size-11 place-items-center rounded-element text-title font-bold hover:bg-muted disabled:opacity-40"
              >
                +
              </button>
            </div>
          </fieldset>
        </div>
      </Card>

      {isLoading && !best ? (
        <Skeleton variant="rectangular" className="h-[640px] rounded-container" />
      ) : best ? (
        <>
          <Card className="overflow-hidden">
            <div className="relative">
              <CardImage
                src={best.coverImageUrl}
                alt={`${best.cities} travel inspiration`}
                height={320}
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                <p className="text-2xs font-bold uppercase tracking-wide text-white/80">
                  Step 2 · Your package
                </p>
                <h3 className="mt-2 max-w-2xl text-headline font-bold">{best.title}</h3>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/85">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={15} /> {best.cities}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={15} /> {best.days} days
                  </span>
                  {best.venueCount ? <span>{best.venueCount} matched places</span> : null}
                </p>
              </div>
            </div>

            <ol className="divide-y divide-border">
              <li className="p-6 sm:p-8">
                <PackagePart icon={Sparkles} kicker="What you go for" title="Event & places" />
                <div className="mt-4 grid gap-4">
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
                  ) : null}
                  <InlineCitySearch city={best.cities} start={dates?.start} end={dates?.end} />
                </div>
              </li>
              <li className="p-6 sm:p-8">
                <PackagePart icon={BedDouble} kicker="Where you sleep" title="Stay your way" />
                <div className="mt-4 flex flex-wrap gap-2">
                  {STAY_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      aria-pressed={stayType === type.value}
                      onClick={() => setStayType(type.value)}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-element px-4 py-2 text-sm font-semibold ${
                        stayType === type.value
                          ? 'bg-foreground text-background'
                          : 'bg-card shadow-soft hover:bg-muted'
                      }`}
                    >
                      <type.icon size={16} aria-hidden />
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
                    <QueerGuideStays city={best.cities} type={stayType} />
                  )}
                </div>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => navigate(bookingUrl('hotels', stayType))}
                >
                  <Hotel /> Compare all {STAY_TYPES.find((type) => type.value === stayType)?.label}
                </Button>
              </li>
              <li className="p-6 sm:p-8">
                <PackagePart icon={Plane} kicker="Door to door" title="How you get there" />
                {/* One choice, one origin, one button: the mode picks the
                    provider so the reader never chooses transport twice. */}
                <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Arrive by">
                  {ARRIVAL_MODES.map(({ value, label, icon: Icon }) => (
                    <FilterChip
                      key={value}
                      active={arrivalMode === value}
                      onClick={() => setArrivalMode(value)}
                      label={
                        <>
                          <Icon size={16} aria-hidden />
                          {label}
                        </>
                      }
                    />
                  ))}
                </div>
                {arrivalMode === 'drive' ? (
                  <div className="mt-4">
                    <CarRentalSection
                      city={best.cities}
                      checkIn={dates?.start}
                      checkOut={dates?.end}
                      compact
                    />
                  </div>
                ) : arrivalMode === 'ferry' ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Add the sailing as a leg once the trip is built.
                  </p>
                ) : (
                  <>
                    {arrivalMode === 'flight' && (
                      <div className="mt-4">
                        <InlineFlightDeals cityId={best.primaryCityId} city={best.cities} />
                      </div>
                    )}
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      {arrivalMode !== 'flight' && (
                        <Input
                          id="package-origin"
                          aria-label="Starting from"
                          className="sm:max-w-xs"
                          value={origin}
                          onChange={(event) => setOrigin(event.target.value)}
                          placeholder="Starting from…"
                        />
                      )}
                      {arrivalMode === 'flight' ? (
                        <Button variant="outline" onClick={() => navigate(bookingUrl('flights'))}>
                          <Plane /> Compare all flights to {best.cities}
                        </Button>
                      ) : (
                        <Button asChild={!!origin} disabled={!origin}>
                          {origin ? (
                            <a
                              href={
                                arrivalMode === 'rail'
                                  ? buildTrainlineUrl({
                                      origin,
                                      destination: best.cities,
                                      departDate: dates?.start,
                                      returnDate: dates?.end,
                                    })
                                  : buildFlixbusUrl({
                                      origin,
                                      destination: best.cities,
                                      departDate: dates?.start,
                                    })
                              }
                              target="_blank"
                              rel="noopener noreferrer sponsored"
                            >
                              {arrivalMode === 'rail' ? <Train /> : <Bus />} Search{' '}
                              {arrivalMode === 'rail' ? 'trains' : 'coaches'}
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              {arrivalMode === 'rail' ? <Train /> : <Bus />} Search{' '}
                              {arrivalMode === 'rail' ? 'trains' : 'coaches'}
                            </span>
                          )}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </li>
            </ol>

            <div className="flex flex-col gap-4 border-t border-border bg-muted/40 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <StepHeading n={3} title="Make it a trip" />
                <p className="mt-1 text-sm text-muted-foreground">
                  We add the destination, event and arrival mode. You shape the days after.
                </p>
                {arrivalMode === 'flight' && (
                  <div className="mt-4 max-w-sm">
                    <p className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                      Optional add-on
                    </p>
                    <TransferSection city={best.cities} compact />
                  </div>
                )}
              </div>
              <Button size="lg" onClick={() => handleCreate(best)} disabled={createTrip.isPending}>
                {createTrip.isPending ? <TrackLoader size={16} /> : null}
                Build this escape <ArrowRight />
              </Button>
            </div>
          </Card>

          {ranked.length > 1 ? (
            <div>
              <h3 className="text-title font-bold">Other matches</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ranked.slice(1, 4).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleCreate(template)}
                    className="card-lift group flex flex-col overflow-hidden rounded-container bg-card text-start shadow-soft"
                  >
                    <CardImage
                      src={template.coverImageUrl}
                      alt=""
                      height={160}
                      className="w-full"
                    />
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-badge bg-muted px-2 py-0.5 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                        {template.source === 'event' ? (
                          <Flag size={12} aria-hidden />
                        ) : (
                          <Sparkles size={12} aria-hidden />
                        )}
                        {template.source === 'event' ? 'Event-led escape' : 'Another match'}
                      </span>
                      <span className="text-15 font-bold leading-tight group-hover:underline">
                        {template.title}
                      </span>
                      <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} aria-hidden />
                          {template.cities}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={12} aria-hidden />
                          {template.days} days
                        </span>
                      </span>
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-13 font-bold">
                        Choose this one
                        <ArrowRight size={14} aria-hidden className="rtl:rotate-180" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
