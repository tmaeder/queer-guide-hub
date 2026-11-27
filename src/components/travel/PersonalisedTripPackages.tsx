import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  nextFriday,
  startOfDay,
} from 'date-fns';
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Bus,
  CalendarDays,
  Compass,
  CalendarRange,
  Coffee,
  Crown,
  Flag,
  Flame,
  Sun,
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
  Search,
  Ship,
  Sparkles,
  Train,
  Ticket,
  Landmark,
  Footprints,
  Utensils,
  Rainbow,
  ChevronRight,
  Handshake,
} from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardImage } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FilterChip } from '@/components/transit/FilterChip';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { TransferSection } from '@/components/travel/TransferSection';
import { TravelMeetLink } from '@/components/travel-meet/TravelMeetLink';
import { InlineCitySearch } from '@/components/travel/InlineCitySearch';
import { QueerGuideStays } from '@/components/travel/QueerGuideStays';
import { InlineFlightDeals } from '@/components/travel/InlineFlightDeals';
import { InlineGroundRoutes, type GroundMode } from '@/components/travel/InlineGroundRoutes';
import { useAuth } from '@/hooks/useAuth';
import { useCityIdentity } from '@/hooks/regionOverride';
import { useCityPhotos } from '@/hooks/useCityPhotos';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import { CityCountryAutocomplete } from '@/components/trips/create/CityCountryAutocomplete';
import { buildTrainlineUrl } from '@/utils/transport/trainlineUrl';
import { buildFlixbusUrl } from '@/utils/transport/flixbusUrl';
import { buildOmioUrl } from '@/utils/transport/omioUrl';
import { useUrlState } from '@/hooks/useUrlState';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useOptionalActiveTrip } from '@/hooks/useActiveTrip';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';
import { useTripTemplates, type TripTemplate } from '@/hooks/useTripTemplates';
import { BOOKING_AID, BOOKING_LABEL_BASE, GYG_PARTNER } from '@/lib/affiliate/config';
import { applySubId } from '@/lib/affiliate/links';
import type { HotelTypeOption } from '@/components/booking/HotelSearchForm';
import type { TransportMode } from '@/components/trips/tripLegs';

type Mood = 'nightlife' | 'slow' | 'pride' | 'kinky' | 'nudist' | 'culture' | 'outdoors';

// Hand-picked from image_assets so each card shows the mood, not a random trip cover.
const MOOD_IMAGES: Record<Mood, string> = {
  nightlife:
    'https://img.queer.guide/event-images/c9182ef09b5dc457803920330ae50d766902fa6810318da987f2eadbd3e28cae.jpg',
  slow: 'https://img.queer.guide/city-images/f3d8c9642e5a9a396ccc89ec2c04e3effe09286d494f421e2ecca69e2fcf2e48.jpg',
  pride:
    'https://img.queer.guide/event-images/891d71c676779cbe5a8462af0f17a2482147fc799da240bb6b2bad721458fdb3.jpg',
  kinky:
    'https://img.queer.guide/event-images/94e56ee4df9475627a708dee6e3558b4d02c670205a17172291429a5055efe88.jpg',
  nudist:
    'https://images.pexels.com/photos/14354909/pexels-photo-14354909.jpeg?auto=compress&cs=tinysrgb&w=1200',
  culture:
    'https://img.queer.guide/event-images/3d036de30bc7e9cfdbefa3384c86c38f13d49638a54a9de5fb5d9b36b0d1b989.jpg',
  outdoors:
    'https://img.queer.guide/city-images/b4ca6e0818c5f639ad22c3d5e598fada07bafc945595aa2706e1cbf1ee7c64dc.jpg',
};

/** Themed templates surface only for their own mood. */
const MOOD_THEME: Partial<Record<Mood, TripTemplate['theme']>> = {
  kinky: 'kink',
  nudist: 'nudist',
};
const fitsMood = (tpl: TripTemplate, mood: Mood) => !tpl.theme || MOOD_THEME[mood] === tpl.theme;
type Timing = 'weekend' | 'month' | 'flexible' | 'custom';
type Budget = 'easy' | 'comfortable' | 'special';
type Duration = 'auto' | 'weekend' | 'week' | 'twoweeks';

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
    value: 'nudist',
    label: 'Nudist',
    hint: 'Nude beaches and naturist resorts',
    icon: Sun,
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

type Company = 'none' | 'looking' | 'open';
const COMPANY: Array<{ value: Company; label: string; icon: typeof Plane }> = [
  { value: 'none', label: 'Not this time', icon: Users },
  { value: 'looking', label: 'Looking for travel buddies', icon: Search },
  { value: 'open', label: 'Open to meeting up', icon: Handshake },
];

// Optional: 'auto' keeps each trip's own length.
const DURATIONS: Array<{ value: Duration; label: string; icon: typeof Plane }> = [
  { value: 'auto', label: 'As the trip suggests', icon: Sparkles },
  { value: 'weekend', label: 'A long weekend', icon: Sun },
  { value: 'week', label: 'A week', icon: CalendarDays },
  { value: 'twoweeks', label: 'Two weeks', icon: CalendarRange },
];
const DURATION_DAYS: Record<Exclude<Duration, 'auto'>, number> = {
  weekend: 3,
  week: 7,
  twoweeks: 14,
};

const STAY_TYPES: Array<{
  value: HotelTypeOption;
  label: string;
  /** Phone label where the full one does not fit four across at 320 px. */
  short?: string;
  icon: typeof Plane;
}> = [
  { value: 'hotel', label: 'Hotels', icon: Hotel },
  { value: 'bnb', label: 'B&Bs', icon: Coffee },
  { value: 'apartment', label: 'Apartments', short: 'Flats', icon: Building2 },
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

/** inspire: mood first, we pick the place. know: the reader names the place. */
const DOORS = ['inspire', 'know'] as const;
type Door = (typeof DOORS)[number];

/** A package for a city the reader chose themselves (door 2): no event, no ranking. */
function templateFromCity(
  city: { cityId: string; cityName: string; countryId: string },
  days: number,
  coverImageUrl: string | null,
): TripTemplate {
  return {
    id: `city:${city.cityId}`,
    title: `Your trip to ${city.cityName}`,
    cities: city.cityName,
    cityIds: [city.cityId],
    primaryCityId: city.cityId,
    primaryCountryId: city.countryId,
    days,
    currency: 'EUR',
    coverImageUrl,
    source: 'preference',
    vibe: null,
    reason: null,
    event: null,
    venueCount: null,
  };
}

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
  if (template.theme) return fitsMood(template, mood) ? 20 : -20;
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
  options: Array<{
    value: T;
    label: string;
    hint?: string;
    icon?: typeof Plane;
    image?: string | null;
  }>;
  onChange: (value: T) => void;
}) {
  // Photo variant: when the options carry pictures, show them as image cards.
  if (options.some((o) => o.image)) {
    return (
      <fieldset className="@container">
        <legend className="mb-4 text-15 font-bold">{label}</legend>
        {/* Columns follow the space this group actually gets (container query),
            not the viewport: 1 → 2 → 4 → 7. Tiles grow with their text, so a
            long title never runs under the icon. */}
        <div className="grid grid-cols-1 gap-4 @[16rem]:grid-cols-2 @[40rem]:grid-cols-4 @[60rem]:grid-cols-7">
          {options.map((option) => {
            const on = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(option.value)}
                className={`group relative flex min-h-40 flex-col justify-end overflow-hidden rounded-container bg-foreground p-4 text-left text-white shadow-soft ${
                  on ? 'ring-4 ring-foreground ring-offset-2 ring-offset-background' : ''
                }`}
              >
                {option.image ? (
                  <span className="absolute inset-0 [&_img]:h-full [&_img]:w-full [&_img]:object-cover">
                    <CardImage src={option.image} alt="" height={160} className="h-full w-full" />
                  </span>
                ) : null}
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
                {option.icon ? (
                  <span
                    aria-hidden
                    className={`relative mb-2 grid h-8 w-8 place-items-center rounded-full ${
                      on ? 'bg-white text-black' : 'bg-black/45 text-white backdrop-blur-sm'
                    }`}
                  >
                    <option.icon size={16} />
                  </span>
                ) : null}
                <span className="relative block text-15 font-bold leading-tight break-words hyphens-auto">
                  {option.label}
                </span>
                {option.hint ? (
                  <span className="relative mt-0.5 line-clamp-2 text-13 leading-snug text-white/80">
                    {option.hint}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend className="mb-4 text-15 font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`flex min-h-11 items-center gap-2 rounded-container px-4 py-2 text-left transition-colors ${
              value === option.value
                ? 'bg-foreground text-background shadow-soft'
                : 'bg-muted hover:bg-surface-container-high'
            }`}
          >
            {option.icon ? <option.icon size={16} aria-hidden className="shrink-0" /> : null}
            <span>
              <span className="block text-15 font-bold">{option.label}</span>
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
  // Wizard state lives in the URL so refresh, Back and shared links restore it.
  // Keys avoid tab/section/city/intent, which /travel already reads.
  const url = useUrlState();
  const [mood, setMood] = url.choice(
    'mood',
    MOODS.map((m) => m.value),
    'nightlife',
  );
  const [door, setDoor] = url.choice('door', DOORS, 'inspire');
  // Someone who already knows the place usually knows the dates too.
  const [timing, setTiming] = url.choice(
    'when',
    TIMINGS.map((m) => m.value),
    door === 'know' ? 'custom' : 'weekend',
  );
  const [customStart, setCustomStart] = url.text('start');
  const [customEnd, setCustomEnd] = url.text('end');
  const customDates = { start: customStart ?? '', end: customEnd ?? '' };
  const [travellers, setTravellers] = url.int('guests', 2, 1, 9);
  const [company, setCompany] = url.choice(
    'company',
    COMPANY.map((m) => m.value),
    'none',
  );
  const [budget, setBudget] = url.choice(
    'budget',
    BUDGETS.map((m) => m.value),
    'comfortable',
  );
  const [duration, setDuration] = url.choice(
    'length',
    DURATIONS.map((m) => m.value),
    'auto',
  );
  const tripDays = (tpl: TripTemplate) =>
    duration === 'auto' ? tpl.days : DURATION_DAYS[duration];
  const [stayType, setStayType] = url.choice(
    'stay',
    STAY_TYPES.map((m) => m.value),
    'hotel',
  );
  const [arrivalMode, setArrivalMode] = url.choice(
    'by',
    ARRIVAL_MODES.map((m) => m.value),
    'rail',
  );
  // Where the trip starts, until the reader types their own: the city of a trip
  // they are on today, then their saved home city, then the detected city.
  const { originCity } = useVisitorOrigin();
  const { data: travelPrefs } = useUserTravelPreferences();
  const { data: homeCity } = useCityIdentity(travelPrefs?.home_city_id ?? null);
  const tripNow = activeTripContext?.activeTrip;
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const underwayCity =
    tripNow?.start_date &&
    tripNow.end_date &&
    tripNow.start_date <= todayIso &&
    todayIso <= tripNow.end_date
      ? tripNow.primary_city_name
      : null;
  // `from=` (empty) means the reader cleared it: do not refill it.
  const [originInput, setOrigin] = url.text('from');
  const origin = originInput ?? underwayCity ?? homeCity?.cityName ?? originCity ?? '';

  const [place, setPlace] = url.text('place');
  // Every city this mood has a trip for; the chips show a random handful so
  // the same few cities do not lead every visit. Shuffle draws another set,
  // and the search box reaches any of them.
  const allPlaces = useMemo(() => {
    const seen = new Set<string>();
    for (const tpl of templates ?? []) {
      if (!fitsMood(tpl, mood)) continue;
      const city = tpl.cities.split(',')[0]?.trim();
      if (city) seen.add(city);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [templates, mood]);
  const [placeSeed, setPlaceSeed] = useState(() => Math.random());
  const places = useMemo(() => {
    // Seeded shuffle, so a re-render does not reorder the chips under a click.
    let x = Math.floor(placeSeed * 2 ** 31) || 1;
    const rand = () => (x = (x * 48271) % 2147483647) / 2147483647;
    return [...allPlaces]
      .map((c) => [rand(), c] as const)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 6)
      .map(([, c]) => c);
  }, [allPlaces, placeSeed]);

  const moodOptions = MOODS.map((m) => ({ ...m, image: MOOD_IMAGES[m.value] }));

  const ranked = useMemo(
    () =>
      [...(templates ?? [])]
        .filter((tpl) => fitsMood(tpl, mood))
        .filter((tpl) => !place || tpl.cities.toLowerCase().includes(place.toLowerCase()))
        .sort((a, b) => scoreTemplate(b, mood, timing) - scoreTemplate(a, mood, timing)),
    [templates, mood, timing, place],
  );
  const [destId, setDestId] = url.text('dest');
  const { data: dest } = useCityIdentity(door === 'know' ? destId : null);
  const { data: destPhotos } = useCityPhotos(door === 'know' ? destId : null);
  const [queerOnly, setQueerOnly] = url.choice('qf', ['0', '1'] as const, '0');
  const [stepSlug, setStepSlug] = url.choice('step', STEP_SLUGS, 'mood');
  // Door 2 has no Choose step; a stray step=choose reads as its first step.
  const step = door === 'know' && stepSlug === 'choose' ? 1 : STEP_SLUGS.indexOf(stepSlug) + 1;
  const stepAfter = (n: number) => (door === 'know' && n === 1 ? 3 : n + 1);
  const stepBefore = (n: number) => (door === 'know' && n === 3 ? 1 : n - 1);
  const [pickedId, setPickedId] = url.text('pick');
  const customDays =
    timing === 'custom' && customDates.start && customDates.end
      ? differenceInCalendarDays(new Date(customDates.end), new Date(customDates.start)) + 1
      : 3;
  const best =
    door === 'know'
      ? dest?.cityId && dest.cityName && dest.countryId
        ? templateFromCity(
            { cityId: dest.cityId, cityName: dest.cityName, countryId: dest.countryId },
            customDays,
            destPhotos?.[0]?.url ?? null,
          )
        : undefined
      : (ranked.find((tpl) => tpl.id === pickedId) ?? ranked[0]);
  const location = useLocation();
  const wizardTop = useRef<HTMLDivElement>(null);
  const goTo = (n: number) => {
    // Push, so the browser's Back goes back one step.
    setStepSlug(STEP_SLUGS[n - 1], { push: true });
    wizardTop.current?.scrollIntoView({ block: 'start' });
  };
  // A trip built around an event runs on the event's dates, not the timing chip.
  // "Pick dates" with nothing picked yet means no dates, not a guessed month.
  const dates = best
    ? best.event && timing !== 'custom'
      ? {
          start: best.event.startDate,
          end: format(addDays(new Date(best.event.startDate), tripDays(best) - 1), 'yyyy-MM-dd'),
        }
      : timing === 'custom' && !customDates.start
        ? null
        : datesFor(timing, tripDays(best), customDates)
    : null;
  const summaryMood = MOODS.find((m) => m.value === mood);
  const summaryStay = STAY_TYPES.find((type) => type.value === stayType);
  const summaryBudget = BUDGETS.find((b) => b.value === budget);
  const summaryArrival = ARRIVAL_MODES.find((m) => m.value === arrivalMode);
  const summaryRange = dates
    ? `${format(new Date(dates.start), 'd MMM')} – ${format(new Date(dates.end), 'd MMM yyyy')}`
    : 'Dates to pick';
  const stayNights = dates
    ? differenceInCalendarDays(new Date(dates.end), new Date(dates.start))
    : 0;
  const arrivalWord =
    arrivalMode === 'flight'
      ? 'plane'
      : arrivalMode === 'rail'
        ? 'train'
        : arrivalMode === 'transit'
          ? 'coach'
          : arrivalMode === 'ferry'
            ? 'ferry'
            : 'car';
  const dayLabel = (iso: string) => format(new Date(iso), 'EEE d MMM');
  const fromWhere = origin.trim();
  const priceMax = budget === 'easy' ? 140 : budget === 'comfortable' ? 300 : undefined;
  const routeStops: Array<{
    key: string;
    when: string;
    title: string;
    detail: string;
    icon: typeof Plane;
    step: number;
  }> = best
    ? [
        {
          key: 'out',
          when: dates ? dayLabel(dates.start) : 'Day 1',
          title: fromWhere ? `${fromWhere} → ${best.cities}` : `To ${best.cities}`,
          detail: `By ${arrivalWord}`,
          icon: summaryArrival?.icon ?? Plane,
          step: 5,
        },
        {
          key: 'stay',
          when: dates ? `${dayLabel(dates.start)} – ${dayLabel(dates.end)}` : 'Stay',
          title: summaryStay?.label ?? 'Stay',
          detail: [
            stayNights > 0 ? `${stayNights} ${stayNights === 1 ? 'night' : 'nights'}` : null,
            priceMax ? `up to €${priceMax} a night` : 'any price',
          ]
            .filter(Boolean)
            .join(' · '),
          icon: summaryStay?.icon ?? BedDouble,
          step: 4,
        },
        {
          key: 'do',
          when: best.event ? dayLabel(best.event.startDate) : 'In between',
          title: best.event?.title ?? 'Events, places and tours',
          detail: best.event ? 'The event' : 'Free days, picked as you go',
          icon: best.event ? Flag : Ticket,
          step: 3,
        },
        {
          key: 'back',
          when: dates ? dayLabel(dates.end) : 'Last day',
          title: fromWhere ? `${best.cities} → ${fromWhere}` : 'Back home',
          detail: `By ${arrivalWord}`,
          icon: summaryArrival?.icon ?? Plane,
          step: 5,
        },
      ]
    : [];
  const { data: stays, isLoading: staysLoading } = useHotelSearch({
    city: best?.cities,
    checkIn: dates?.start,
    checkOut: dates?.end,
    guests: travellers,
    hotelType: stayType,
    priceMax,
    lgbtqFriendlyOnly: queerOnly === '1' || undefined,
    limit: 3,
    enabled: !!best,
  });
  const bookableStays = (stays ?? []).filter((stay) => Boolean(stay.bookingUrl)).slice(0, 3);

  // Step 6: every partner link in one list, for anyone, signed in or not.
  const routeTrip =
    best && fromWhere.length >= 2
      ? {
          origin: fromWhere,
          destination: best.cities,
          departDate: dates?.start,
          returnDate: dates?.end,
          adults: travellers,
        }
      : null;
  const arrivalLink = !routeTrip
    ? null
    : arrivalMode === 'rail'
      ? { partner: 'Trainline', href: buildTrainlineUrl(routeTrip) }
      : arrivalMode === 'transit'
        ? { partner: 'FlixBus', href: buildFlixbusUrl(routeTrip) }
        : arrivalMode === 'flight'
          ? { partner: 'Omio', href: buildOmioUrl({ ...routeTrip, mode: 'flights' }) }
          : arrivalMode === 'ferry'
            ? { partner: 'Omio', href: buildOmioUrl(routeTrip) }
            : null;
  const bookLinks = best
    ? [
        {
          key: 'stay',
          icon: summaryStay?.icon ?? Hotel,
          label: `${summaryStay?.label ?? 'Stays'} in ${best.cities}`,
          partner: 'Booking.com',
          href: bookingComSearch(best.cities, dates, travellers, stayType, priceMax),
        },
        ...(arrivalLink
          ? [
              {
                key: 'arrive',
                icon: summaryArrival?.icon ?? Plane,
                label: `${fromWhere} → ${best.cities}`,
                ...arrivalLink,
              },
            ]
          : []),
        {
          key: 'tours',
          icon: Ticket,
          label: `Tours in ${best.cities}`,
          partner: 'GetYourGuide',
          href: applySubId(
            `https://www.getyourguide.com/s/?${new URLSearchParams({ q: best.cities, partner_id: GYG_PARTNER })}`,
            'getyourguide',
            'trip_suggest',
          ),
        },
      ]
    : [];

  const handleCreate = (template: TripTemplate) => {
    if (!user) {
      // The wizard lives in the URL, so sign-in brings the reader back to it.
      navigate(`/auth?redirect=${encodeURIComponent(`/travel${location.search}`)}`);
      return;
    }
    const tripDates = datesFor(timing, tripDays(template), customDates);
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
        {door === 'know'
          ? 'Name the place and dates, then line up things to do, a stay and the way there. Every booking link waits at the end.'
          : 'Pick a mood, then check the package: one destination with its event, places, stay and way to get there. Every booking link waits at the end.'}
      </p>

      <div ref={wizardTop} className="scroll-mt-28 space-y-4">
        <div role="group" aria-label="How to start" className="flex flex-wrap gap-2">
          {(
            [
              ['inspire', 'Inspire me', Sparkles],
              ['know', "I know where I'm going", MapPin],
            ] as const
          ).map(([value, label, Icon]) => (
            <FilterChip
              key={value}
              active={door === value}
              onClick={() => {
                if (door === value) return;
                setDoor(value as Door);
                goTo(1);
              }}
              label={
                <>
                  <Icon size={14} aria-hidden /> {label}
                </>
              }
            />
          ))}
        </div>
        <WizardSteps step={step} door={door} canChoose={!!best} onGo={goTo} />
      </div>

      {step === 1 && (
        <Card className="p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="flex flex-col gap-8 lg:col-span-3">
              {/* Where the trip starts, first, in both doors: the getting-there
                  step, the route summary and the booking links all read it. */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex w-full max-w-xs flex-col gap-1.5">
                  <label htmlFor="trip-start" className="text-sm font-bold">
                    Starting from
                  </label>
                  <Input
                    id="trip-start"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="Your city"
                    autoComplete="address-level2"
                  />
                </div>
                {door === 'know' && (
                  <div className="w-full max-w-md">
                    <CityCountryAutocomplete
                      id="trip-finder-city"
                      label="Where to?"
                      value={
                        dest?.cityId && dest.cityName && dest.countryId
                          ? {
                              cityId: dest.cityId,
                              cityName: dest.cityName,
                              countryId: dest.countryId,
                              countryName: dest.countryName ?? '',
                              countryCode: dest.countryCode,
                              timezone: null,
                            }
                          : null
                      }
                      onChange={(selection) => setDestId(selection?.cityId ?? null)}
                    />
                  </div>
                )}
              </div>
              {door === 'inspire' && (
                <ChipGroup label="Mood" value={mood} options={moodOptions} onChange={setMood} />
              )}
            </div>
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
                      onChange={(e) => setCustomStart(e.target.value || null)}
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
                      onChange={(e) => setCustomEnd(e.target.value || null)}
                      className="w-44"
                    />
                  </div>
                </div>
              )}
            </div>
            <ChipGroup
              label="How long (optional)"
              value={duration}
              options={DURATIONS}
              onChange={setDuration}
            />
            <ChipGroup label="Budget" value={budget} options={BUDGETS} onChange={setBudget} />
            {door === 'inspire' && allPlaces.length > 1 && (
              <fieldset className="lg:col-span-2">
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
                  {/* A searched city stays visible as the active chip. */}
                  {(place && !places.includes(place) ? [place, ...places] : places).map((c) => (
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
                  {allPlaces.length > places.length && (
                    <FilterChip
                      active={false}
                      onClick={() => setPlaceSeed(Math.random())}
                      aria-label="Show other places"
                      label={
                        <>
                          <Shuffle size={14} aria-hidden /> Other places
                        </>
                      }
                    />
                  )}
                </div>
                <div className="relative mt-4 max-w-sm">
                  <Search
                    size={16}
                    aria-hidden
                    className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="search"
                    list="trip-place-options"
                    aria-label="Search a city"
                    placeholder="Search a city"
                    onChange={(e) => {
                      const q = e.target.value.trim();
                      setPlace(
                        q
                          ? (allPlaces.find((c) => c.toLowerCase() === q.toLowerCase()) ?? q)
                          : null,
                      );
                    }}
                    className="ps-10"
                  />
                  <datalist id="trip-place-options">
                    {allPlaces.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                {place && ranked.length === 0 && (
                  <p className="mt-2 text-13 text-muted-foreground">
                    No {MOODS.find((m) => m.value === mood)?.label.toLowerCase() ?? ''} trip for{' '}
                    {place} yet. Try another mood or city.
                  </p>
                )}
              </fieldset>
            )}
            <fieldset>
              <legend className="mb-4 text-sm font-bold">
                Travellers <span className="font-normal text-muted-foreground">(optional)</span>
              </legend>
              <div className="inline-flex items-center gap-1 rounded-element bg-card p-1 shadow-soft">
                <button
                  type="button"
                  onClick={() => setTravellers(Math.max(1, travellers - 1))}
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
                  onClick={() => setTravellers(Math.min(9, travellers + 1))}
                  disabled={travellers >= 9}
                  aria-label="One traveller more"
                  className="grid size-11 place-items-center rounded-element text-title font-bold hover:bg-muted disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </fieldset>
            <ChipGroup
              label="Travel buddies (optional)"
              value={company}
              options={COMPANY}
              onChange={setCompany}
            />
          </div>
        </Card>
      )}

      {door === 'inspire' && isLoading && !best ? (
        <Skeleton variant="rectangular" className="h-[640px] rounded-container" />
      ) : best ? (
        <>
          {step >= 3 && step <= 5 && (
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
                    Your package
                  </p>
                  <h3 className="mt-2 max-w-2xl text-headline font-bold">{best.title}</h3>
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/85">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={15} /> {best.cities}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={15} /> {tripDays(best)} days
                    </span>
                    {best.venueCount ? <span>{best.venueCount} matched places</span> : null}
                  </p>
                </div>
              </div>

              <ol className="divide-y divide-border">
                {step === 3 && (
                  <li className="p-6 sm:p-8">
                    <PackagePart icon={Sparkles} kicker="What you go for" title="Things to do" />
                    <div className="mt-4 grid grid-cols-1 gap-4">
                      {best.event ? (
                        <LocalizedLink
                          to={`/events/${best.event.slug}`}
                          className="flex items-center gap-4 rounded-element bg-foreground p-4 text-background no-underline hover:opacity-90"
                        >
                          <span
                            aria-hidden
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background/15"
                          >
                            <Flag size={18} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-2xs font-bold uppercase tracking-label text-background/70">
                              Anchor event ·{' '}
                              {format(new Date(best.event.startDate), 'EEE d MMM yyyy')}
                            </span>
                            <span className="block truncate font-bold">{best.event.title}</span>
                          </span>
                          <ArrowRight size={16} aria-hidden className="shrink-0 rtl:rotate-180" />
                        </LocalizedLink>
                      ) : null}
                      <PackageThingsToDo city={best.cities} start={dates?.start} end={dates?.end} />
                    </div>
                  </li>
                )}
                {step === 4 && (
                  <li className="p-6 sm:p-8">
                    <PackagePart icon={BedDouble} kicker="Where you sleep" title="Stay your way" />
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-13 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarRange size={14} aria-hidden /> {summaryRange}
                        {stayNights > 0
                          ? ` · ${stayNights} ${stayNights === 1 ? 'night' : 'nights'}`
                          : ''}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={14} aria-hidden /> {travellers}{' '}
                        {travellers === 1 ? 'person' : 'people'}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Wallet size={14} aria-hidden /> {summaryBudget?.label}
                      </span>
                    </p>
                    <div className="mt-6">
                      {/* Queer-run listings are ~92% B&Bs and rarely carry a
                      price, so type and budget are not applied to them; they
                      shape the Booking.com search below instead. */}
                      <QueerGuideStays city={best.cities} naturist={mood === 'nudist'} />
                    </div>
                    {mood !== 'nudist' && (
                      // Partner results know nothing about naturism, so the
                      // nudist package only offers stays tagged clothing-optional.
                      <section className="mt-8 flex flex-col gap-4">
                        <h5 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                          More stays for these dates
                        </h5>
                        <div
                          role="group"
                          aria-label="Stay type"
                          className="flex gap-0.5 rounded-container bg-card p-1 shadow-soft sm:gap-1"
                        >
                          {STAY_TYPES.map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              aria-pressed={stayType === type.value}
                              onClick={() => setStayType(type.value)}
                              className={`flex min-h-11 flex-auto items-center justify-center gap-2 rounded-element px-1.5 text-xs font-bold whitespace-nowrap transition-colors sm:px-2 sm:text-13 ${
                                stayType === type.value
                                  ? 'bg-foreground text-background'
                                  : 'hover:bg-muted'
                              }`}
                            >
                              <type.icon
                                size={16}
                                aria-hidden
                                className="hidden shrink-0 sm:block"
                              />
                              {type.short ? (
                                <>
                                  <span className="sm:hidden" aria-hidden>
                                    {type.short}
                                  </span>
                                  <span className="sr-only sm:not-sr-only">{type.label}</span>
                                </>
                              ) : (
                                type.label
                              )}
                            </button>
                          ))}
                        </div>
                        <div>
                          <FilterChip
                            active={queerOnly === '1'}
                            onClick={() => setQueerOnly(queerOnly === '1' ? '0' : '1')}
                            label={
                              <>
                                <Rainbow size={14} aria-hidden /> Queer-friendly only
                              </>
                            }
                          />
                        </div>
                        {staysLoading ? (
                          <Skeleton variant="rectangular" className="h-16 rounded-element" />
                        ) : (
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
                                <span className="block text-xs text-muted-foreground">
                                  Live result
                                </span>
                              </span>
                              <span className="text-sm font-bold">
                                {stay.currency} {Math.round(stay.price)}
                              </span>
                            </a>
                          ))
                        )}
                        <a
                          href={bookingComSearch(
                            best.cities,
                            dates,
                            travellers,
                            stayType,
                            priceMax,
                          )}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="card-lift flex items-center gap-4 rounded-element bg-card p-4 text-foreground no-underline shadow-soft"
                        >
                          <span
                            aria-hidden
                            className="hidden size-10 shrink-0 place-items-center rounded-full bg-muted sm:grid"
                          >
                            {summaryStay ? <summaryStay.icon size={18} /> : <Hotel size={18} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold leading-snug">
                              {summaryStay?.label ?? 'Stays'} in {best.cities}
                            </span>
                            <span className="block text-13 text-muted-foreground">
                              {[
                                summaryRange,
                                `${travellers} ${travellers === 1 ? 'person' : 'people'}`,
                                priceMax ? `up to €${priceMax} a night` : 'any price',
                              ].join(' · ')}
                            </span>
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-13 font-bold">
                            <span className="sr-only sm:not-sr-only">Booking.com</span>
                            <ArrowUpRight size={16} aria-hidden />
                          </span>
                        </a>
                      </section>
                    )}
                  </li>
                )}
                {step === 5 && (
                  <li className="p-6 sm:p-8">
                    <PackagePart
                      icon={summaryArrival?.icon ?? Plane}
                      kicker="Door to door"
                      title="How you get there"
                    />
                    {/* One choice, one origin: the mode picks the provider so the
                    reader never chooses transport twice. One row at every width. */}
                    <div
                      role="group"
                      aria-label="Arrive by"
                      className="mt-4 flex gap-1 rounded-container bg-card p-1 shadow-soft"
                    >
                      {ARRIVAL_MODES.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={arrivalMode === value}
                          onClick={() => setArrivalMode(value)}
                          className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-element px-1 text-13 font-bold transition-colors ${
                            arrivalMode === value
                              ? 'bg-foreground text-background'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <Icon size={16} aria-hidden className="hidden shrink-0 sm:block" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4">
                      {arrivalMode === 'flight' ? (
                        <InlineFlightDeals
                          cityId={best.primaryCityId}
                          city={best.cities}
                          startCity={origin}
                          dates={dates}
                        />
                      ) : (
                        <InlineGroundRoutes
                          mode={arrivalMode as GroundMode}
                          city={best.cities}
                          origin={origin}
                          onOriginChange={setOrigin}
                          dates={dates}
                          travellers={travellers}
                        />
                      )}
                    </div>
                  </li>
                )}
              </ol>
            </Card>
          )}

          {step === 6 && (
            <Card className="overflow-hidden">
              <div className="relative">
                <CardImage
                  src={best.coverImageUrl}
                  alt={`${best.cities} travel inspiration`}
                  height={240}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                  <p className="text-2xs font-bold uppercase tracking-label text-white/80">
                    Your escape
                  </p>
                  <h3 className="mt-1 text-headline font-bold leading-tight">{best.title}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={14} aria-hidden /> {best.cities}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays size={14} aria-hidden /> {tripDays(best)} days
                    </span>
                  </p>
                </div>
              </div>
              <div className="p-6 sm:p-8">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div>
                    <h4 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                      Your route
                    </h4>
                    <ol className="m-0 mt-4 list-none p-0">
                      {routeStops.map((stop, i) => (
                        <li key={stop.key} className="flex gap-4">
                          <span aria-hidden className="flex w-10 shrink-0 flex-col items-center">
                            <span className="grid size-10 place-items-center rounded-full bg-card ring-2 ring-foreground ring-inset">
                              <stop.icon size={16} />
                            </span>
                            {i < routeStops.length - 1 && (
                              <span className="w-1 flex-1 rounded-full bg-track-pink" />
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => goTo(stop.step)}
                            aria-label={`${stop.when}: ${stop.title}. ${stop.detail}. Change`}
                            className="group flex min-w-0 flex-1 items-start gap-4 pb-6 text-start"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-2xs font-bold uppercase tracking-label text-muted-foreground">
                                {stop.when}
                              </span>
                              <span className="block font-bold leading-snug group-hover:underline">
                                {stop.title}
                              </span>
                              <span className="block text-13 text-muted-foreground">
                                {stop.detail}
                              </span>
                            </span>
                            <span
                              aria-hidden
                              className="mt-4 shrink-0 text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground"
                            >
                              <ChevronRight size={16} className="sm:hidden" />
                              <span className="hidden text-13 font-bold sm:inline">Change</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="flex flex-col gap-4">
                    <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 lg:grid-cols-1">
                      {[
                        door === 'know'
                          ? { label: 'Where', value: best.cities, icon: MapPin }
                          : {
                              label: 'Mood',
                              value: summaryMood?.label ?? '',
                              icon: summaryMood?.icon ?? Sparkles,
                            },
                        {
                          label: 'Who',
                          value: `${travellers} ${travellers === 1 ? 'person' : 'people'}`,
                          icon: Users,
                        },
                      ].map((fact) => (
                        <li key={fact.label}>
                          <button
                            type="button"
                            onClick={() => goTo(1)}
                            aria-label={`${fact.label}: ${fact.value}. Change`}
                            className="flex w-full items-center gap-2 rounded-element bg-surface-container p-2 text-start hover:bg-muted"
                          >
                            <span
                              aria-hidden
                              className="grid size-8 shrink-0 place-items-center rounded-full bg-card"
                            >
                              <fact.icon size={14} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-2xs font-bold uppercase tracking-label text-muted-foreground">
                                {fact.label}
                              </span>
                              <span className="block truncate text-sm font-bold">{fact.value}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {company !== 'none' && (
                      <TravelMeetLink
                        context={{
                          cityId: best.primaryCityId,
                          start: dates?.start ?? '',
                          end: dates?.end ?? '',
                          eventId: best.event?.id ?? '',
                        }}
                        countryIds={[best.primaryCountryId]}
                        compose={company === 'open'}
                        label={
                          company === 'open'
                            ? `Invite someone along in ${best.cities}`
                            : `Find travel buddies in ${best.cities} on these dates`
                        }
                      />
                    )}
                    {arrivalMode === 'flight' && (
                      <div>
                        <p className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                          Optional add-on
                        </p>
                        <TransferSection city={best.cities} compact />
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-6 border-t border-border pt-6">
                  <h4
                    id="trip-book-links"
                    className="text-2xs font-bold uppercase tracking-label text-muted-foreground"
                  >
                    Book it
                  </h4>
                  <ul
                    aria-labelledby="trip-book-links"
                    className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-3"
                  >
                    {bookLinks.map((link) => (
                      <li key={link.key}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="flex min-h-11 items-center gap-2 rounded-element bg-surface-container p-4 text-sm font-bold no-underline hover:bg-muted"
                        >
                          <link.icon size={16} aria-hidden />
                          <span className="min-w-0 flex-1">
                            {link.label}
                            <span className="block text-13 font-normal text-muted-foreground">
                              {link.partner}
                            </span>
                          </span>
                          <ArrowUpRight size={14} aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Save it to keep the destination, event and arrival mode, then shape the days.
                  </p>
                  <Button
                    size="lg"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => handleCreate(best)}
                    disabled={createTrip.isPending}
                  >
                    {createTrip.isPending ? <TrackLoader size={16} /> : null}
                    Save as trip <ArrowRight />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {step === 2 && ranked.length > 0 ? (
            <Card className="p-6 sm:p-8">
              <StepHeading
                n={2}
                title="Choose your escape"
                hint="The best matches for your choices. Pick one to see the package."
              />
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ranked.slice(0, 6).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={template.id === best.id}
                    onClick={() => {
                      setPickedId(template.id);
                      goTo(3);
                    }}
                    className={`card-lift group flex flex-col overflow-hidden rounded-container bg-card text-start shadow-soft ${
                      template.id === best.id ? 'ring-4 ring-foreground' : ''
                    }`}
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
                        {template.id === ranked[0].id
                          ? 'Best match'
                          : template.source === 'event'
                            ? 'Event-led escape'
                            : 'Another match'}
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
                      <span
                        aria-hidden
                        className="mt-auto grid h-9 w-9 place-items-center self-end rounded-full bg-foreground text-background"
                      >
                        <ArrowRight size={16} className="rtl:rotate-180" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      ) : door === 'know' ? null : (
        <Card className="p-8 text-center">
          <h3 className="text-title font-bold">Fresh packages are on their way</h3>
          <p className="mt-2 text-muted-foreground">
            We could not verify enough destination data to recommend one safely right now.
          </p>
        </Card>
      )}

      {(best || (door === 'know' && step === 1)) && (
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Phones: Back is icon-only (name kept for screen readers) and the next
              step fills the rest of the row, so neither button can overflow. */}
          {step > 1 ? (
            <Button
              variant="outline"
              size="lg"
              className="shrink-0 px-4 sm:px-8"
              onClick={() => goTo(stepBefore(step))}
            >
              <ArrowRight className="rotate-180 rtl:rotate-0" />
              <span className="sr-only sm:not-sr-only">Back</span>
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          {step < 6 ? (
            <Button
              size="lg"
              className="min-w-0 flex-1 px-4 sm:flex-none sm:px-8"
              disabled={!best}
              onClick={() => goTo(stepAfter(step))}
            >
              {door === 'know' && step === 1 ? 'See things to do' : NEXT_LABEL[step]}{' '}
              <ArrowRight className="rtl:rotate-180" />
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

const ACTIVITY_KINDS: Array<{ label: string; query: string; icon: typeof Plane }> = [
  { label: 'Queer tours', query: 'LGBTQ tour', icon: Rainbow },
  { label: 'Walking tours', query: 'walking tour', icon: Footprints },
  { label: 'Museums', query: 'museum tickets', icon: Landmark },
  { label: 'Food & drink', query: 'food tour', icon: Utensils },
  { label: 'Boat trips', query: 'boat tour', icon: Ship },
  { label: 'Day trips', query: 'day trip', icon: Mountain },
];

/**
 * GetYourGuide's widget frame has no resize message, so its height is derived
 * from its width. Measured 2026-11-25: from 560px the tours sit in one row and
 * the frame is ~495px tall; below that two tours stack, each ~0.56·w + 165px.
 */
/** Booking.com results for the package city, dates and party size. */
/** Booking.com property-type filter ids (nflt ht_id). */
const BOOKING_TYPE_IDS: Partial<Record<HotelTypeOption, number>> = {
  hotel: 204,
  apartment: 201,
  hostel: 203,
  bnb: 208,
};

function bookingComSearch(
  city: string,
  dates: { start: string; end: string } | null,
  guests: number,
  type?: HotelTypeOption,
  maxPerNight?: number,
) {
  const params = new URLSearchParams({
    ss: city,
    aid: BOOKING_AID,
    label: BOOKING_LABEL_BASE,
    group_adults: String(guests),
  });
  if (dates) {
    params.set('checkin', dates.start);
    params.set('checkout', dates.end);
  }
  const filters = [
    type && BOOKING_TYPE_IDS[type] ? `ht_id=${BOOKING_TYPE_IDS[type]}` : null,
    maxPerNight ? `price=EUR-0-${maxPerNight}-1` : null,
  ].filter(Boolean);
  if (filters.length) params.set('nflt', filters.join(';'));
  return applySubId(
    `https://www.booking.com/searchresults.html?${params.toString()}`,
    'booking',
    'trip_suggest',
  );
}

function activityFrameLayout(width: number) {
  if (width >= 560) return { items: width >= 576 ? 3 : 2, height: 500 };
  return { items: 2, height: Math.ceil(2 * (0.56 * width + 165) + 48) };
}

function activityFrameSrc(city: string, query: string, items: number) {
  const params = new URLSearchParams({
    locale_code: 'en-US',
    widget: 'activities',
    number_of_items: String(items),
    partner_id: GYG_PARTNER,
    cmp: 'trip_suggest',
    q: `${city} ${query}`,
  });
  return `https://widget.getyourguide.com/default/activities.frame?${params.toString()}`;
}

/**
 * Tours and activities for the package city, shown inline. The activity API
 * only returns a "browse <city>" placeholder today, so live listings come from
 * GetYourGuide's own widget frame (CSP already allows it). The kinds filter it.
 */
function PackageActivities({ city }: { city: string }) {
  const [kind, setKind] = useState(0);
  const [width, setWidth] = useState(0);
  const frameBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = frameBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = activityFrameLayout(width);
  const active = ACTIVITY_KINDS[kind];

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of tour">
        {ACTIVITY_KINDS.map((option, i) => (
          <FilterChip
            key={option.label}
            active={i === kind}
            onClick={() => setKind(i)}
            label={
              <>
                <option.icon size={14} aria-hidden /> {option.label}
              </>
            }
          />
        ))}
      </div>
      <div ref={frameBox} className="mt-4 overflow-hidden rounded-element bg-card">
        {width > 0 ? (
          <iframe
            key={`${kind}-${layout.items}`}
            src={activityFrameSrc(city, active.query, layout.items)}
            title={`${active.label} in ${city}`}
            loading="lazy"
            className="block w-full border-0"
            style={{ height: layout.height }}
          />
        ) : null}
      </div>
    </div>
  );
}

const TODO_TABS = [
  { value: 'event', label: 'Events', icon: CalendarDays },
  { value: 'venue', label: 'Places', icon: MapPin },
  { value: 'tours', label: 'Tours', icon: Ticket },
] as const;

/** Events, places and tours for the package city: one switch, one panel. */
function PackageThingsToDo({ city, start, end }: { city: string; start?: string; end?: string }) {
  const [tab, setTab] = useState<(typeof TODO_TABS)[number]['value']>('event');
  return (
    <div className="rounded-container bg-surface-container p-2 sm:p-4">
      <div
        role="group"
        aria-label="Things to do"
        className="flex gap-1 rounded-container bg-card p-1 shadow-soft"
      >
        {TODO_TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={tab === option.value}
            onClick={() => setTab(option.value)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-element px-2 text-13 font-bold transition-colors ${
              tab === option.value ? 'bg-foreground text-background' : 'hover:bg-muted'
            }`}
          >
            <option.icon size={16} aria-hidden className="hidden shrink-0 sm:block" />
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'tours' ? (
          <PackageActivities city={city} />
        ) : (
          <InlineCitySearch city={city} kind={tab} start={start} end={end} />
        )}
      </div>
    </div>
  );
}

const WIZARD_STEPS = ['Mood', 'Choose', 'To do', 'Stay', 'Getting there', 'Book'] as const;
/** URL slugs for WIZARD_STEPS, same order. */
const STEP_SLUGS = ['mood', 'choose', 'to-do', 'stay', 'getting-there', 'book'] as const;
const NEXT_LABEL: Record<number, string> = {
  1: 'See matches',
  2: 'See the package',
  3: 'Where to stay',
  4: 'How to get there',
  5: 'Make it a trip',
};

function WizardSteps({
  step,
  door,
  canChoose,
  onGo,
}: {
  step: number;
  door: Door;
  canChoose: boolean;
  onGo: (n: number) => void;
}) {
  // Door 2 starts at the place and has no Choose step; numbers follow what is shown.
  const items = WIZARD_STEPS.map((label, i) => ({
    n: i + 1,
    label: door === 'know' && i === 0 ? 'Where & when' : label,
  })).filter(({ n }) => !(door === 'know' && n === 2));
  return (
    <nav aria-label="Trip finder steps">
      {/* One segmented track, one row at every width. Below sm only the current
          step shows its name; the others shrink to their number (the name stays
          as the accessible name) and share the remaining width evenly. */}
      <ol className="m-0 flex w-full list-none gap-0.5 rounded-container bg-card p-1 shadow-soft md:gap-1">
        {items.map(({ n, label }, i) => {
          const active = n === step;
          const reachable = n === 1 || canChoose;
          return (
            <li
              key={label}
              className={active ? 'flex-none sm:flex-auto' : 'min-w-0 flex-1 sm:flex-auto'}
            >
              <button
                type="button"
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                onClick={() => onGo(n)}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-element text-13 font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:text-muted-foreground sm:px-4 ${
                  active
                    ? 'bg-foreground px-4 text-background'
                    : 'hover:bg-muted disabled:hover:bg-transparent'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-6 w-6 shrink-0 place-items-center rounded-full text-2xs ${
                    active
                      ? 'hidden bg-background/15 md:grid'
                      : n < step
                        ? 'grid bg-foreground text-background sm:hidden md:grid'
                        : 'grid bg-muted sm:hidden md:grid'
                  }`}
                >
                  {n < step ? '✓' : i + 1}
                </span>
                <span className={active ? undefined : 'sr-only sm:not-sr-only'}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
