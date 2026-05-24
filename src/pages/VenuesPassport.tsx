import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { Skeleton } from '@/components/ui/skeleton';
import { VenuesPersonalStrip } from '@/components/venues/VenuesPersonalStrip';
import { useGamification } from '@/hooks/useGamification';
import { useVisitedVenues } from '@/hooks/useVenuesV2Data';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

const VenuesPassport = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { catalog, achievements, loading: gLoading } = useGamification();
  const { venues, loading } = useVisitedVenues();
  useMeta({
    title: 'Passport',
    description: 'Your collected venues and achievements.',
    canonicalPath: '/venues/passport',
  });

  const groupedByCity = useMemo(() => {
    const map = new Map<string, VisitedVenue[]>();
    for (const v of venues) {
      const key = v.city ?? 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [venues]);

  const earnedSet = new Set(achievements.map((a) => a.achievement_slug));

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <p>{t('venues.passport.signInPrompt', 'Sign in to see your passport.')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-10">
      <header>
        <h1 className="text-headline font-semibold mb-2">
          {t('venues.passport.title', 'Your passport')}
        </h1>
        <p className="text-muted-foreground">
          {t('venues.passport.subtitle', 'Every venue you’ve checked into and every badge you’ve earned.')}
        </p>
      </header>

      <VenuesPersonalStrip />

      <section aria-labelledby="achievements-h">
        <h2 id="achievements-h" className="text-title font-semibold mb-4">
          {t('venues.passport.achievements', 'Achievements')}
        </h2>
        {gLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-container" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {catalog.map((a) => {
              const earned = earnedSet.has(a.slug);
              const Icon = (Icons[a.icon as keyof typeof Icons] as LucideIcon | undefined) ?? Icons.Award;
              return (
                <div
                  key={a.slug}
                  className={
                    'rounded-container border p-4 ' +
                    (earned ? 'bg-card' : 'bg-card/40 text-muted-foreground')
                  }
                >
                  <Icon size={20} className={earned ? '' : 'opacity-50'} />
                  <p className="mt-2 text-sm font-semibold">{a.name}</p>
                  <p className="text-xs mt-1">{a.description}</p>
                  <p className="text-2xs mt-2 uppercase tracking-wider">
                    {earned
                      ? t('venues.passport.earned', 'Earned')
                      : t('venues.passport.locked', `+${a.points_reward} pts`)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="visited-h">
        <h2 id="visited-h" className="text-title font-semibold mb-4">
          {t('venues.passport.visited', { count: venues.length, defaultValue: '{{count}} venues visited' })}
        </h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-container" />
            ))}
          </div>
        ) : venues.length === 0 ? (
          <p className="text-muted-foreground">
            {t('venues.passport.empty', 'No check-ins yet. Visit a venue to start your passport.')}
          </p>
        ) : (
          <div className="space-y-8">
            {groupedByCity.map(([city, list]) => (
              <div key={city}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {city} · {list.length}
                </h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {list.map((v) => (
                    <li key={v.id} className="border rounded-container overflow-hidden flex">
                      {v.images?.[0] && (
                        <div
                          className="w-20 h-20 shrink-0 bg-muted bg-cover bg-center"
                          style={{ backgroundImage: `url(${v.images[0]})` }}
                          aria-hidden
                        />
                      )}
                      <div className="p-3 min-w-0">
                        <LocalizedLink
                          to={`/venues/${v.slug ?? v.id}`}
                          className="text-sm font-semibold truncate block"
                        >
                          {v.name}
                        </LocalizedLink>
                        <p className="text-xs text-muted-foreground truncate">
                          {[v.city, v.country].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default VenuesPassport;
