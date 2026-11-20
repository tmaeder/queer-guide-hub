import { cn } from '@/lib/utils';
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
} from '@/components/icons';
import { useGamification } from '@/hooks/useGamification';
import { SectionHeader } from '@/components/ui/SectionHeader';

// Explicit registry so Rollup tree-shakes lucide-react. Add new icons here
// when the achievements_catalog gains new icon strings.
const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
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
};

/** Full achievements catalog with earned/locked state. Moved from VenuesPassport. */
export function AchievementsGrid() {
  const { t } = useTranslation();
  const { catalog, achievements, loading } = useGamification();
  const earnedSet = new Set(achievements.map((a) => a.achievement_slug));

  return (
    <section aria-labelledby="achievements-h">
      <SectionHeader
        size="section"
        id="achievements-h"
        title={t('venues.passport.achievements', 'Achievements')}
        className="mb-4"
      />
      {loading ? (
        <div className="h-40 rounded-container bg-card" />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('venues.passport.earnedCount', '{{earned}} of {{total}} earned', {
              earned: catalog.filter((a) => earnedSet.has(a.slug)).length,
              total: catalog.length,
            })}
          </p>
          <ul className="m-0 grid list-none grid-cols-1 gap-x-6 divide-y divide-border rounded-container bg-card px-4 py-1 p-0 md:grid-cols-2 md:divide-y-0">
            {[...catalog]
              .sort((a, b) => Number(earnedSet.has(b.slug)) - Number(earnedSet.has(a.slug)))
              .map((a) => {
                const earned = earnedSet.has(a.slug);
                const Icon = ACHIEVEMENT_ICONS[a.icon] ?? Award;
                return (
                  <li
                    key={a.slug}
                    className={cn(
                      'flex items-center gap-2.5 py-2.5',
                      !earned && 'text-muted-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                        earned ? 'bg-foreground text-background' : 'bg-muted',
                      )}
                    >
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn('truncate text-sm font-bold', earned && 'text-foreground')}
                      >
                        {a.name}
                      </span>
                      <span className="truncate text-xs">{a.description}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">
                      {earned
                        ? t('venues.passport.earned', 'Earned')
                        : t('venues.passport.locked', '+{{pts}} pts', { pts: a.points_reward })}
                    </span>
                  </li>
                );
              })}
          </ul>
        </>
      )}
    </section>
  );
}
