import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HomeSection } from './HomeSection';
import { MilestoneImpactMarker } from '@/components/milestones/MilestoneImpactMarker';
import { useMilestonesOnThisDay } from '@/hooks/useMilestones';

/**
 * "On this day" — queer-history milestones whose anniversary is today. With
 * ~110 curated entries most days have no hit, so the whole section self-hides
 * on empty (renders null, like HomeBornThisWeek). Deliberately motion-free:
 * milestone content includes persecution events — the celebratory joy moment
 * stays exclusive to BornThisWeek.
 */
export default function HomeOnThisDay() {
  const { t } = useTranslation();
  const { data, isLoading } = useMilestonesOnThisDay(3);

  if (isLoading || !data?.length) return null;

  return (
    <HomeSection
      eyebrow={t('milestones.home.eyebrow', 'Queer history')}
      title={t('milestones.home.title', 'On this day')}
      seeAllHref="/history"
      seeAllLabel={t('milestones.home.seeAll', 'Full timeline')}
    >
      <ul className="grid gap-6 md:grid-cols-3">
        {data.map((m) => (
          <li key={m.id}>
            <LocalizedLink to={`/history/${m.slug}`} className="group block no-underline">
              <span className="block font-display text-display font-semibold leading-none">
                {m.date.slice(0, 4)}
              </span>
              <span className="mt-2 flex items-start gap-2">
                <span className="mt-1.5 shrink-0">
                  <MilestoneImpactMarker impact={m.impact} />
                </span>
                <span className="min-w-0">
                  <span className="block text-15 font-semibold group-hover:underline">{m.title}</span>
                  <span className="block text-13 text-muted-foreground">
                    {[m.city_name, m.country_name].filter(Boolean).join(', ') || ' '}
                    {' · '}
                    {t('milestones.home.yearsAgo', '{{count}} years ago', { count: m.years_ago })}
                  </span>
                </span>
              </span>
            </LocalizedLink>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
