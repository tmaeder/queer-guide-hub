import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { PageContainer } from '@/components/layout/PageContainer';
import { MilestoneImpactMarker } from '@/components/milestones/MilestoneImpactMarker';
import { useMilestonesOnThisDay } from '@/hooks/useMilestones';

/**
 * "On this day" band for /history (the homepage has its own grid treatment in
 * HomeOnThisDay). A full-bleed ink-ruled band rather than a tinted panel —
 * on /history it is one of the page's structural bands, so it takes the band
 * edge and its own container. Self-hides when today has no anniversary.
 */
export function OnThisDayBand() {
  const { t } = useTranslation();
  const { data, isLoading } = useMilestonesOnThisDay(3);
  if (isLoading || !data?.length) return null;
  return (
    <section
      aria-label={t('milestones.onThisDay', 'On this day')}
      className="border-b-4 border-foreground"
    >
      <PageContainer flush className="py-6">
        <Eyebrow variant="kicker">{t('milestones.onThisDay', 'On this day')}</Eyebrow>
        <ul className="m-0 mt-4 list-none space-y-2 p-0">
          {data.map((m) => (
            <li key={m.id}>
              {/* no-underline opts out of the unlayered `li a` inline-link rule
                  (which would force display:inline and crush the flex row) */}
              <LocalizedLink
                to={`/history/${m.slug}`}
                className="group flex items-center gap-2 no-underline"
              >
                <MilestoneImpactMarker impact={m.impact} size="station" />
                <span className="text-title font-bold leading-none">{m.date.slice(0, 4)}</span>
                <span className="min-w-0 truncate text-15 group-hover:underline">{m.title}</span>
                <span className="ms-auto hidden shrink-0 text-13 text-muted-foreground sm:inline">
                  {t('milestones.home.yearsAgo', '{{count}} years ago', { count: m.years_ago })}
                </span>
              </LocalizedLink>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
