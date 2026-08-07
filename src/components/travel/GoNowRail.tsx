import { useTranslation } from 'react-i18next';
import { CalendarDays, TrendingUp, Sun } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalImg } from '@/components/ui/ExternalImg';
import { getFallbackImage } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { useGoNowDestinations, type GoNowReason } from '@/hooks/useGoNowDestinations';

const REASON_ICON: Record<GoNowReason['kind'], typeof CalendarDays> = {
  event: CalendarDays,
  season: Sun,
  trending: TrendingUp,
};

/**
 * Month-aware "go now" rail: portrait destination plates with one reason line
 * (an upcoming pride/festival, a best-time-to-visit match, or trending).
 * Static on purpose — /travel is outside the sanctioned motion zones.
 */
export function GoNowRail() {
  const { t } = useTranslation();
  const { data, isLoading } = useGoNowDestinations(6);

  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });

  if (isLoading) return <RailSkeleton />;
  if (!data || data.length < 3) return null;

  return (
    <section aria-labelledby="travel-go-now-heading" className="mb-12">
      <header className="mb-4">
        <p className="mb-1 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
          {t('pages.travel.goNow.kicker', 'This month')}
        </p>
        <h3 id="travel-go-now-heading" className="text-headline font-bold tracking-tight">
          {t('pages.travel.goNow.heading', 'Go now — {{month}}', { month: monthName })}
        </h3>
      </header>

      <ScrollArea className="-mx-4 px-4">
        <ul className="flex gap-4 pb-4">
          {data.map((d) => {
            const fallback = getFallbackImage('place', d.cityId);
            const img = isValidImageUrl(d.imageUrl) ? d.imageUrl : null;
            const ReasonIcon = REASON_ICON[d.reason.kind];
            const reasonLabel =
              d.reason.kind === 'trending'
                ? t('pages.travel.goNow.trending', 'Trending now')
                : d.reason.label;
            return (
              <li key={d.cityId} className="w-[200px] shrink-0 snap-start sm:w-[240px]">
                <LocalizedLink
                  to={`/city/${d.slug || d.cityId}`}
                  className="group relative block aspect-[3/4] overflow-hidden rounded-container bg-surface-container no-underline"
                >
                  <ExternalImg
                    src={img}
                    cfWidth={500}
                    fallbackSrc={fallback}
                    alt={d.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                  />
                  <div className="img-scrim-readable absolute inset-0" />
                  <div className="absolute bottom-0 start-0 end-0 p-4 text-white">
                    <p className="font-display text-title font-bold leading-tight">{d.name}</p>
                    {d.countryName && <p className="mt-0.5 text-13 opacity-90">{d.countryName}</p>}
                    <p className="mt-2 flex items-center gap-1.5 text-13 opacity-90">
                      <ReasonIcon size={13} aria-hidden className="shrink-0" />
                      <span className="line-clamp-1">{reasonLabel}</span>
                    </p>
                  </div>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

function RailSkeleton() {
  return (
    <section aria-hidden className="mb-12">
      <div className="mb-4 h-6 w-48 bg-muted" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            className="aspect-[3/4] w-[200px] shrink-0 rounded-container sm:w-[240px]"
          />
        ))}
      </div>
    </section>
  );
}
