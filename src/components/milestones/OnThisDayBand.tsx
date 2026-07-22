import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MilestoneImpactMarker } from '@/components/milestones/MilestoneImpactMarker';
import { useMilestonesOnThisDay } from '@/hooks/useMilestones';

/**
 * Compact "on this day" band for the /history page (the homepage has its own
 * grid treatment in HomeOnThisDay). Self-hides when today has no anniversary.
 */
export function OnThisDayBand() {
  const { t } = useTranslation();
  const { data, isLoading } = useMilestonesOnThisDay(3);
  if (isLoading || !data?.length) return null;
  return (
    <section
      aria-label={t('milestones.onThisDay', 'On this day')}
      className="mb-8 rounded-container border border-border p-4"
    >
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">
        {t('milestones.onThisDay', 'On this day')}
      </p>
      <ul className="mt-2 space-y-2">
        {data.map((m) => (
          <li key={m.id}>
            <LocalizedLink to={`/history/${m.slug}`} className="group flex items-center gap-2">
              <MilestoneImpactMarker impact={m.impact} />
              <span className="font-display text-title font-semibold leading-none">
                {m.date.slice(0, 4)}
              </span>
              <span className="min-w-0 truncate text-15 group-hover:underline">{m.title}</span>
              <span className="hidden shrink-0 text-13 text-muted-foreground sm:inline">
                {t('milestones.home.yearsAgo', '{{count}} years ago', { count: m.years_ago })}
              </span>
            </LocalizedLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
