import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from '@/components/icons';
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
    <section aria-label={t('travel.villagesRail.heading', 'Queer villages')} className="mb-12">
      <header className="mb-4 flex justify-end">
        {/* /villages itself redirects via /places back to /travel — the page
            this rail is rendered on — so "see all" goes to the map with the
            neighbourhoods layer on. */}
        <LocalizedLink
          to="/map?layers=neighbourhoods"
          className="inline-flex items-center gap-2 text-13 font-medium text-muted-foreground no-underline hover:text-foreground"
        >
          {t('travel.villagesRail.seeAll', 'See all')}
          <ArrowRight size={14} />
        </LocalizedLink>
      </header>

      <ScrollArea className="-mx-6 -mt-4 -mb-8">
        <ul className="flex gap-4 px-6 pt-4 pb-12">
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
          <Skeleton
            key={i}
            variant="rectangular"
            height={240}
            className="w-72 shrink-0 rounded-container"
          />
        ))}
      </div>
    </section>
  );
}
