import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MilestoneRow } from '@/components/milestones/MilestoneRow';
import { useMilestonesForCountry } from '@/hooks/useMilestones';

/**
 * Compact "legal history" strip for country/city rights sections: the top
 * milestones (by significance) tied to this country, chronologically, linking
 * to the filtered /history timeline. Self-hides on zero rows.
 */
export function CountryLegalHistory({
  countryId,
  countryName,
  limit = 6,
}: {
  countryId: string | null | undefined;
  /** Display name — the /history country filter matches on the label. */
  countryName?: string | null;
  limit?: number;
}) {
  const { t } = useTranslation();
  const { data } = useMilestonesForCountry(countryId ?? undefined, limit);
  if (!countryId || !data?.length) return null;
  const seeAll = countryName ? `/history?country=${encodeURIComponent(countryName)}` : '/history';

  return (
    <section className="rounded-container border border-border p-6">
      <h3 className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
        {t('milestones.legalHistory.title', 'Legal history')}
      </h3>
      <div className="space-y-4">
        {data.map((m) => (
          <MilestoneRow key={m.id} milestone={m} density="compact" />
        ))}
      </div>
      <LocalizedLink
        to={seeAll}
        className="mt-4 inline-flex items-center gap-1 text-13 font-medium text-muted-foreground hover:text-foreground"
      >
        {t('milestones.legalHistory.seeAll', 'Full timeline')}
        <ArrowRight size={14} aria-hidden />
      </LocalizedLink>
    </section>
  );
}
