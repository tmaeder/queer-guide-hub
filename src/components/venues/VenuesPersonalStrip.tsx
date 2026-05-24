import { Flame, MapPin, Trophy, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  useGamification,
  levelName,
  pointsForLevel,
  progressToNextLevel,
} from '@/hooks/useGamification';
import { Skeleton } from '@/components/ui/skeleton';

export function VenuesPersonalStrip() {
  const { t } = useTranslation();
  const { data, loading } = useGamification();

  if (loading) {
    return (
      <div className="rounded-container border bg-card p-6">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const next = data.level < 10 ? pointsForLevel(data.level + 1) : null;
  const progress = progressToNextLevel(data.points, data.level);

  return (
    <section
      className="rounded-container border bg-card p-6"
      aria-label={t('venues.personalStrip.label', 'Your venue stats')}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-title font-semibold">
          {t('venues.personalStrip.title', { name: levelName(data.level), defaultValue: '{{name}} · Level {{level}}', level: data.level })}
        </h2>
        <Link
          to="/venues/passport"
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          {t('venues.personalStrip.passport', 'View passport')}
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <Stat icon={<Trophy size={18} />} label={t('venues.personalStrip.points', 'Points')} value={data.points} />
        <Stat icon={<MapPin size={18} />} label={t('venues.personalStrip.venues', 'Venues')} value={data.total_venues} />
        <Stat icon={<Flame size={18} />} label={t('venues.personalStrip.streak', 'Day streak')} value={data.current_streak} />
        <Stat icon={<Sparkles size={18} />} label={t('venues.personalStrip.checkins', 'Check-ins')} value={data.total_checkins} />
      </div>

      {next !== null && (
        <div className="mt-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>
              {t('venues.personalStrip.nextLevel', { name: levelName(data.level + 1), defaultValue: 'Next: {{name}}' })}
            </span>
            <span>{data.points} / {next}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-element bg-muted">
            <div
              className="h-full bg-foreground transition-[width] duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-headline font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
