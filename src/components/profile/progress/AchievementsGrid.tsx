import { useTranslation } from 'react-i18next';
import {
  Award,
  CalendarDays,
  Crown,
  Flag,
  Flame,
  Footprints,
  Globe,
  Globe2,
  Heart,
  LayoutGrid,
  Map,
  MapPin,
  Moon,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useGamification } from '@/hooks/useGamification';
import { ProfileSectionHeader } from '@/components/profile/ProfileSectionHeader';

// Explicit registry so Rollup tree-shakes lucide-react. Add new icons here
// when the achievements_catalog gains new icon strings.
const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  CalendarDays, Crown, Flag, Flame, Footprints, Globe, Globe2,
  Heart, LayoutGrid, Map, MapPin, Moon, Sparkles,
};

/** Full achievements catalog with earned/locked state. Moved from VenuesPassport. */
export function AchievementsGrid() {
  const { t } = useTranslation();
  const { catalog, achievements, loading } = useGamification();
  const earnedSet = new Set(achievements.map((a) => a.achievement_slug));

  return (
    <section aria-labelledby="achievements-h">
      <ProfileSectionHeader
        id="achievements-h"
        title={t('venues.passport.achievements', 'Achievements')}
        className="mb-4"
      />
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-container" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {catalog.map((a) => {
            const earned = earnedSet.has(a.slug);
            const Icon = ACHIEVEMENT_ICONS[a.icon] ?? Award;
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
  );
}
