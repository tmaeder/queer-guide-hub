import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import {
  useCityLeaderboard,
  useGlobalLeaderboard,
  useDiscoveryProfile,
  type LeaderboardRow,
} from '@/hooks/useVenuesV2Data';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';

type Row = LeaderboardRow;

const VenuesLeaderboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  useMeta({
    title: 'Leaderboard',
    description: 'Top explorers on Queer Guide.',
    canonicalPath: '/venues/leaderboard',
  });

  const { data: dp } = useDiscoveryProfile();
  const myCity = dp?.primary_city_id
    ? { id: dp.primary_city_id, name: dp.primary_city_name ?? 'Your city' }
    : null;

  const { rows: globalRows, loading: loadingGlobal } = useGlobalLeaderboard(100);
  const { rows: cityRows, loading: loadingCity } = useCityLeaderboard(myCity?.id ?? null, 100);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 space-y-8">
      <header>
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={24} />
          <h1 className="text-headline font-semibold">{t('venues.leaderboard.title', 'Leaderboard')}</h1>
        </div>
        <p className="text-muted-foreground">
          {t('venues.leaderboard.subtitle', 'Top explorers ranked by venues visited.')}
        </p>
      </header>

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
    </div>
  );
};

function Board({
  rows,
  loading,
  currentUserId,
}: {
  rows: Row[];
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
    return <p className="text-muted-foreground">{t('venues.leaderboard.empty', 'No data yet — be the first to check in.')}</p>;
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
                <span className="ml-2 rounded-badge bg-foreground px-2 py-0.5 text-xs text-background">
                  {t('venues.leaderboard.widget.you', 'You')}
                </span>
              )}
            </span>
            <span className="tabular-nums text-sm text-muted-foreground">
              {r.venues_visited} {t('venues.leaderboard.venuesShort', 'venues')}
            </span>
            <span className="tabular-nums text-sm">{r.points} pts</span>
          </li>
        );
      })}
    </ol>
  );
}

export default VenuesLeaderboard;
