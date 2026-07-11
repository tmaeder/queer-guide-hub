import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useCityLeaderboard,
  useGlobalLeaderboard,
  useDiscoveryProfile,
  type LeaderboardRow,
} from '@/hooks/useVenuesV2Data';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionHeader } from '@/components/ui/SectionHeader';

const COLLAPSED_LIMIT = 10;
const EXPANDED_LIMIT = 100;

/** Global + home-city explorer rankings. Moved from VenuesLeaderboard. */
export function LeaderboardPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? EXPANDED_LIMIT : COLLAPSED_LIMIT;

  const { data: dp } = useDiscoveryProfile();
  const myCity = dp?.primary_city_id
    ? { id: dp.primary_city_id, name: dp.primary_city_name ?? 'Your city' }
    : null;

  const { rows: globalRows, loading: loadingGlobal } = useGlobalLeaderboard(limit);
  const { rows: cityRows, loading: loadingCity } = useCityLeaderboard(myCity?.id ?? null, limit);

  // Only offer "view all" once a board is actually filled to the collapsed cap.
  const canExpand = expanded || globalRows.length >= COLLAPSED_LIMIT;

  return (
    <section aria-label="Leaderboard" className="flex flex-col gap-4">
      <SectionHeader size="section" title={t('venues.leaderboard.title', 'Leaderboard')} />
      <Tabs defaultValue="global">
        <TabsList>
          <TabsTrigger value="global">{t('venues.leaderboard.tabs.global', 'Global')}</TabsTrigger>
          {myCity && (
            <TabsTrigger value="city">
              {t('venues.leaderboard.tabs.city', { city: myCity.name, defaultValue: 'In {{city}}' })}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="global" className="pt-6">
          <Board rows={globalRows} loading={loadingGlobal} currentUserId={user?.id} />
        </TabsContent>
        {myCity && (
          <TabsContent value="city" className="pt-6">
            <Board rows={cityRows} loading={loadingCity} currentUserId={user?.id} />
          </TabsContent>
        )}
      </Tabs>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center justify-center gap-1 self-start text-13 text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <>
              {t('common.showLess', 'Show fewer')} <ChevronUp size={14} aria-hidden />
            </>
          ) : (
            <>
              {t('venues.leaderboard.viewAll', 'View top 100')} <ChevronDown size={14} aria-hidden />
            </>
          )}
        </button>
      )}
    </section>
  );
}

function Board({
  rows,
  loading,
  currentUserId,
}: {
  rows: LeaderboardRow[];
  loading: boolean;
  currentUserId: string | undefined;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground">
        {t('venues.leaderboard.empty', 'No data yet — be the first to check in.')}
      </p>
    );
  }
  return (
    <ol className="divide-y border rounded-container overflow-hidden bg-card">
      {rows.map((r) => {
        const isYou = currentUserId === r.user_id;
        return (
          <li
            key={r.user_id}
            className="flex items-center gap-4 px-4 py-2"
            aria-current={isYou ? 'true' : undefined}
          >
            <span className="w-8 text-right tabular-nums font-semibold">{r.rank}</span>
            <span className="flex-1 truncate">
              {r.display_name ?? t('venues.leaderboard.widget.anon', 'Anonymous explorer')}
              {isYou && (
                <span className="ml-2 rounded-badge bg-foreground px-2 py-0.5 text-2xs text-background">
                  {t('venues.leaderboard.widget.you', 'You')}
                </span>
              )}
            </span>
            <span className="tabular-nums text-13 text-muted-foreground">
              {r.venues_visited} {t('venues.leaderboard.venuesShort', 'venues')}
            </span>
            <span className="tabular-nums text-sm">{r.points} pts</span>
          </li>
        );
      })}
    </ol>
  );
}
