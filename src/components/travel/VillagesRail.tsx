import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueerVillages } from '@/hooks/useQueerVillages';
import { useVisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';
import { VillageCard } from '@/components/villages/VillageCard';
import type { VisitedFilter } from './visitedFilter';

interface Props {
  visitedFilter?: VisitedFilter;
  limit?: number;
}

/**
 * One of the two rails the legacy InspirationGrid split into for /travel v2.
 * Single-purpose: horizontal scroll of queer villages with the visited filter
 * applied. Skeleton + empty state collapse cleanly.
 */
export function VillagesRail({ visitedFilter = 'all', limit = 8 }: Props) {
  const { t } = useTranslation();
  const { villages, loading } = useQueerVillages();
  const visitedLookup = useVisitedPlaceLookup();

  const filtered = useMemo(() => {
    let list = villages;
    if (visitedFilter !== 'all') {
      list = list.filter((v) => {
        const isVisited = !!v.id && visitedLookup.has('village', v.id);
        return visitedFilter === 'only_visited' ? isVisited : !isVisited;
      });
    }
    return list.slice(0, limit);
  }, [villages, visitedFilter, visitedLookup, limit]);

  if (loading) return <RailSkeleton />;
  if (filtered.length === 0) return null;

  return (
    <section aria-labelledby="travel-villages-rail-heading" className="mb-12">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
            {t('travel.villagesRail.kicker', 'Neighborhoods')}
          </p>
          <h2 id="travel-villages-rail-heading" className="text-headline font-bold tracking-tight">
            {t('travel.villagesRail.heading', 'Queer villages')}
          </h2>
        </div>
        <LocalizedLink
          to="/places"
          className="inline-flex items-center gap-2 text-13 font-medium text-muted-foreground no-underline hover:text-foreground"
        >
          {t('travel.villagesRail.seeAll', 'See all')}
          <ArrowRight size={14} />
        </LocalizedLink>
      </header>

      <ScrollArea className="-mx-4 px-4">
        <ul className="flex gap-4 pb-4">
          {filtered.map((village) => (
            <li key={village.id} className="w-72 shrink-0 snap-start">
              <VillageCard village={village} />
            </li>
          ))}
        </ul>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

function RailSkeleton() {
  return (
    <section aria-hidden className="mb-12">
      <div className="mb-4 h-6 w-40 bg-muted" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={240} className="w-72 shrink-0 rounded-container" />
        ))}
      </div>
    </section>
  );
}
