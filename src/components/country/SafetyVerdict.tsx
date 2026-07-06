import { useTranslation } from 'react-i18next';
import { Skull, ShieldAlert, ArrowDown } from 'lucide-react';
import { useTripSafety } from '@/hooks/useTripSafety';
import { useRiskVisual, type OverallRisk } from '@/hooks/useRiskVisual';
import { getScoreLabel } from '@/utils/equalityScore';

interface SafetyVerdictProps {
  countryId: string;
  equalityScore: number | null;
  /** Anchor id of the full rights section to scroll to. */
  rightsHref?: string;
}

const VERDICT_KEY: Record<OverallRisk, string> = {
  low: 'welcoming',
  moderate: 'mixed',
  high: 'caution',
  critical: 'dangerous',
};

const VERDICT_DEFAULT: Record<OverallRisk, string> = {
  low: 'Welcoming',
  moderate: 'Mixed',
  high: 'Use caution',
  critical: 'Dangerous',
};

const SCORE_LABEL_KEY: Record<string, string> = {
  'Very High': 'veryHigh',
  High: 'high',
  Moderate: 'moderate',
  Low: 'low',
  'Very Low': 'veryLow',
  'No Data': 'noData',
};

/**
 * Compact, glanceable LGBTQ+ safety verdict for a single country. The one
 * chromatic element on the country page — reuses the locked risk traffic-light
 * (via useRiskVisual) so it can never drift from the trip safety briefing.
 *
 * Risk is computed by useTripSafety, which is authoritative: death penalty ⇒
 * critical, criminalization ⇒ high, independent of equality_score. A nice
 * editorial hook or a high score can NEVER soften a criminalizing destination.
 */
export function SafetyVerdict({
  countryId,
  equalityScore,
  rightsHref = '#rights',
}: SafetyVerdictProps) {
  const { t } = useTranslation();
  const report = useTripSafety(countryId ? [countryId] : []);
  const risk = report.overallRisk;
  const visual = useRiskVisual(risk);
  const Icon = visual.Icon;

  // Defensive invariant: a criminalizing destination must never read as safe,
  // even if useTripSafety regresses upstream. Outing-safety is load-bearing.
  const effectiveRisk: OverallRisk = report.hasDeathPenaltyDestination
    ? 'critical'
    : report.hasCriminalizedDestination && (risk === 'low' || risk === 'moderate')
      ? 'high'
      : risk;

  const verdictWord = t(`country.verdict.${VERDICT_KEY[effectiveRisk]}`, VERDICT_DEFAULT[effectiveRisk]);
  const scoreInfo = getScoreLabel(equalityScore);
  const tierLabel = t(
    `trips.safety.scoreLabel.${SCORE_LABEL_KEY[scoreInfo.label] ?? 'noData'}`,
    { defaultValue: scoreInfo.label },
  );

  return (
    <div
      className="flex flex-col gap-4 rounded-container border p-6 sm:flex-row sm:items-center sm:justify-between"
      style={{ backgroundColor: visual.bg, borderColor: visual.border }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-element"
          style={{ color: visual.fg, backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)' }}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p
            className="text-2xs font-bold uppercase tracking-[0.14em]"
            style={{ color: visual.fg }}
          >
            {t('country.verdict.eyebrow', 'For LGBTQ+ travelers')}
          </p>
          <p className="text-title font-bold leading-tight" style={{ color: visual.fg }}>
            {verdictWord}
          </p>
          {(report.hasDeathPenaltyDestination || report.hasCriminalizedDestination) && (
            <p className="mt-1 flex items-center gap-1.5 text-13 font-semibold" style={{ color: visual.fg }}>
              {report.hasDeathPenaltyDestination ? (
                <>
                  <Skull className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('trips.safety.flags.deathPenalty', 'Death penalty in effect for same-sex relations')}
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('trips.safety.flags.criminalized', 'Same-sex relations are criminalized')}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 self-stretch sm:self-auto">
        <div className="text-right">
          <p className="text-2xs uppercase tracking-[0.12em]" style={{ color: visual.fg }}>
            {t('country.verdict.equality', 'Equality')}
          </p>
          <p className="text-headline font-bold leading-none" style={{ color: visual.fg }}>
            {equalityScore != null ? equalityScore : '—'}
            <span className="text-13 font-semibold">/100</span>
          </p>
          <p className="text-2xs" style={{ color: visual.fg }}>
            {tierLabel}
          </p>
        </div>
        <a
          href={rightsHref}
          className="inline-flex items-center gap-1 self-center text-13 font-semibold no-underline hover:underline"
          style={{ color: visual.fg }}
        >
          {t('country.verdict.fullBreakdown', 'Full breakdown')}
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

export default SafetyVerdict;
