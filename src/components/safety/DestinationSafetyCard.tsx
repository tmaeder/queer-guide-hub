import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTripSafety } from '@/hooks/useTripSafety';
import { useRiskVisual, type OverallRisk } from '@/hooks/useRiskVisual';

const HEADLINE: Record<OverallRisk, string> = {
  low: 'Welcoming destination',
  moderate: 'Use everyday caution',
  high: 'Higher-risk destination',
  critical: 'Severe legal risk',
};

interface Props {
  countryIds: Array<string | null | undefined>;
  className?: string;
}

/**
 * Compact destination-safety context for a detail page sidebar. Wraps
 * useTripSafety for the entity's country(ies) and links through to the full
 * country safety page. Stays silent on low-risk, flag-free destinations so it
 * only ever surfaces when it carries real signal.
 */
export function DestinationSafetyCard({ countryIds, className }: Props) {
  const ids = useMemo(
    () => [...new Set(countryIds.filter(Boolean) as string[])],
    [countryIds],
  );
  const report = useTripSafety(ids);
  const visual = useRiskVisual(report.overallRisk);

  if (report.countries.length === 0) return null;
  if (report.overallRisk === 'low' && !report.hasCriminalizedDestination) return null;

  const Icon = visual.Icon;

  const worst = [...report.countries].sort(
    (a, b) => (a.equality_score ?? 100) - (b.equality_score ?? 100),
  )[0];

  const subtext = report.hasDeathPenaltyDestination
    ? `Same-sex activity can carry the death penalty in ${worst.name}. Read the safety briefing before you travel.`
    : report.hasCriminalizedDestination
      ? `Same-sex activity is criminalized in ${worst.name}. Review local laws and risks first.`
      : `LGBTQ+ legal protections are limited in ${worst.name}. Know the local context.`;

  return (
    <div
      className={`rounded-container border p-4 ${className ?? ''}`}
      style={{ backgroundColor: visual.bg, borderColor: visual.border }}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: visual.fg }} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-15 font-semibold m-0" style={{ color: visual.fg }}>
            {HEADLINE[report.overallRisk]}
          </p>
          <p className="mt-1 text-13 leading-relaxed m-0" style={{ color: visual.fg }}>
            {subtext}
          </p>
          <div className="mt-4 flex flex-col gap-1">
            {report.countries.map((c) => (
              <LocalizedLink
                key={c.id}
                to={`/country/${c.id}`}
                className="inline-flex items-center gap-1 text-13 font-medium no-underline hover:underline"
                style={{ color: visual.fg }}
              >
                {c.name} safety
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </LocalizedLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DestinationSafetyCard;
