import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HotelCard } from '@/components/hotels/HotelCard';
import { fetchHotelsPage } from '@/hooks/useHotels';

/** Every spelling the hotel data uses for "you can be naked here". */
const NATURIST_AMENITIES = [
  'clothing-optional-accepted',
  'clothing optional accepted',
  'clothing_optional_accepted',
  'clothing-optional',
  'clothing optional',
  'clothing optional pool',
  'nudism-allowed',
  'nude zone',
];

/** Queer-run B&Bs, guesthouses and private stays we hold for a city. */
export function QueerGuideStays({
  city,
  type,
  typeLabel,
  naturist = false,
}: {
  city: string;
  /** Stay type to prefer (trip finder vocabulary; 'boutique' means hotels). */
  type?: string;
  /** Plural label for the type, shown when no stay of that type is listed. */
  typeLabel?: string;
  /** Only clothing-optional stays (the Nudist mood). */
  naturist?: boolean;
}) {
  const typeFilter = type === 'boutique' ? 'hotel' : type || undefined;
  const amenitiesAny = naturist ? NATURIST_AMENITIES : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['queer-guide-stays', city.toLowerCase(), typeFilter ?? 'any', naturist],
    queryFn: async () => {
      const typed = await fetchHotelsPage(
        { city, hotel_type: typeFilter, amenitiesAny },
        { pageSize: 3 },
      );
      if (typed.hotels.length > 0 || !typeFilter) return { hotels: typed.hotels, matched: true };
      const any = await fetchHotelsPage({ city, amenitiesAny }, { pageSize: 3 });
      return { hotels: any.hotels, matched: false };
    },
    staleTime: 10 * 60_000,
  });

  if (!isLoading && (!data || data.hotels.length === 0)) {
    return naturist ? (
      <p className="rounded-element bg-muted p-4 text-13 text-muted-foreground">
        No clothing-optional stays listed in {city} yet. Many naturist resorts rent rooms or
        pitches; search “naturist” under Event &amp; places above.
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            On queer.guide
          </p>
          <p className="text-15 font-bold">
            {naturist ? `Clothing-optional stays in ${city}` : `Queer-run stays in ${city}`}
          </p>
        </div>
        <LocalizedLink
          to={`/hotels?city=${encodeURIComponent(city)}`}
          className="inline-flex shrink-0 items-center gap-1 text-13 font-bold no-underline hover:underline"
        >
          See all <ArrowRight size={14} aria-hidden className="rtl:rotate-180" />
        </LocalizedLink>
      </div>
      {data && !data.matched && typeLabel ? (
        <p className="text-13 text-muted-foreground">
          No queer-run {typeLabel.toLowerCase()} listed in {city} yet. These are the other queer-run
          stays.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*:nth-child(3)]:hidden lg:[&>*:nth-child(3)]:block">
        {isLoading
          ? [1, 2, 3].map((i) => <HotelCard key={i} loading />)
          : data!.hotels.map((h) => <HotelCard key={h.id} hotel={h} />)}
      </div>
    </div>
  );
}
