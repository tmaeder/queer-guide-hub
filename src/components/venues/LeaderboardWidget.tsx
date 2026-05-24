import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useCityLeaderboard } from '@/hooks/useVenuesV2Data';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';

interface LeaderboardWidgetProps {
  cityId: string | null;
  cityName: string | null;
}

export function LeaderboardWidget({ cityId, cityName }: LeaderboardWidgetProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { rows, loading } = useCityLeaderboard(cityId, 5);

  if (!loading && rows.length === 0) return null;

  return (
    <section
      className="rounded-container border bg-card p-6"
      aria-label={t('venues.leaderboard.widget.label', 'Top explorers')}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={16} />
          <h2 className="text-title font-semibold">
            {cityName
              ? t('venues.leaderboard.widget.titleCity', { city: cityName, defaultValue: 'Top in {{city}}' })
              : t('venues.leaderboard.widget.titleGlobal', 'Top explorers')}
          </h2>
        </div>
        <Link
          to="/venues/leaderboard"
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          {t('venues.leaderboard.widget.viewAll', 'View all')}
        </Link>
      </div>

      <ol className="space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
          : rows.map((r) => {
              const isYou = user?.id === r.user_id;
              return (
                <li
                  key={r.user_id}
                  className="flex items-center gap-3 text-sm"
                  aria-current={isYou ? 'true' : undefined}
                >
                  <span className="w-6 text-right tabular-nums font-semibold text-muted-foreground">
                    {r.rank}
                  </span>
                  <span className="flex-1 truncate">
                    {r.display_name ?? t('venues.leaderboard.widget.anon', 'Anonymous explorer')}
                    {isYou && (
                      <span className="ml-2 rounded-badge bg-foreground px-2 py-0.5 text-xs text-background">
                        {t('venues.leaderboard.widget.you', 'You')}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {r.venues_visited}
                  </span>
                </li>
              );
            })}
      </ol>
    </section>
  );
}
