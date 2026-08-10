import type { ReactNode } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Skull } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { FactGrid } from '@/components/transit/FactGrid';
import { cn } from '@/lib/utils';
import { useTripSafety } from '@/hooks/useTripSafety';
import { getScoreLabel } from '@/utils/equalityScore';
import type { CityRelation } from './types';
import { formatPopulation } from './types';

export interface CityAtAGlanceProps {
  city: CityRelation;
  hasAirport: boolean;
  effectiveIata: string | null;
}

/**
 * The single summary band on the page — every headline fact lives here once.
 * Leads with a safety verdict derived from the country's legal status (the only
 * place danger gets the reserved --destructive token), linking down to the full
 * Safety & rights section.
 */
export function CityAtAGlance({ city, hasAirport, effectiveIata }: CityAtAGlanceProps) {
  const { t } = useTranslation();
  const countryId = city.countries?.id as string | undefined;
  const report = useTripSafety(countryId ? [countryId] : []);
  const score = city.countries?.equality_score as number | null | undefined;

  // Until the country row lands, every flag on the report is false, so the
  // fallback branch below would pair a ShieldCheck with an equality tier on a
  // city whose country criminalises — a reassuring tile on exactly the pages
  // that must not reassure. Absence of a verdict is the honest render.
  const settled = report.status === 'ready' || report.status === 'idle';

  const danger =
    settled && (report.hasDeathPenaltyDestination || report.hasCriminalizedDestination);
  const SafetyIcon = !settled
    ? ShieldQuestion
    : report.hasDeathPenaltyDestination
      ? Skull
      : report.hasCriminalizedDestination
        ? ShieldAlert
        : ShieldCheck;
  const safetyLabel = !settled
    ? t('cities.detail.glance.checkingLaws', 'Checking…')
    : report.hasDeathPenaltyDestination
      ? t('cities.detail.glance.deathPenalty', 'Death penalty')
      : report.hasCriminalizedDestination
        ? t('cities.detail.glance.criminalized', 'Criminalized')
        : score != null
          ? t('cities.detail.glance.equalityTier', '{{tier}} equality', {
              tier: getScoreLabel(score).label,
            })
          : t('cities.detail.glance.checkLaws', 'Check local laws');

  const facts: { label: string; value: ReactNode }[] = [];
  if (city.lgbt_friendly_rating)
    facts.push({
      label: t('cities.detail.glance.rating', 'LGBTQ+ rating'),
      value: `${city.lgbt_friendly_rating}/5`,
    });
  if (city.population)
    facts.push({
      label: t('cities.detail.glance.population', 'Population'),
      value: formatPopulation(city.population),
    });
  if (city.local_language)
    facts.push({
      label: t('cities.detail.glance.language', 'Language'),
      value: city.local_language,
    });
  if (city.countries?.currency)
    facts.push({
      label: t('cities.detail.glance.currency', 'Currency'),
      value: city.countries.currency,
    });
  if (city.best_time_to_visit)
    facts.push({
      label: t('cities.detail.glance.bestTime', 'Best time'),
      value: city.best_time_to_visit,
    });
  if (effectiveIata)
    facts.push({
      label: t('cities.detail.glance.airport', 'Airport'),
      value: hasAirport ? effectiveIata : `~${effectiveIata}`,
    });

  // Spec module 01 (fact strip) — but the SAFETY verdict is deliberately NOT
  // inside it. The strip renders every cell with equal weight, which is right
  // for population and currency and wrong for "Criminalized": flattening a
  // legal verdict into a row of trivia is exactly how a reader skims past it.
  // So safety keeps its own block above, at full width, with the reserved
  // --destructive token and the jump link intact; the ordinary facts adopt
  // the shared module below.
  return (
    <div className="flex flex-col gap-2">
      <a
        href="#rights"
        className="block border-[3px] border-foreground p-4 no-underline"
        aria-label={t('cities.detail.glance.safetyLink', 'Jump to safety & rights')}
      >
        <Eyebrow as="div" className="mb-2">
          {t('cities.detail.glance.safety', 'Safety')}
        </Eyebrow>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-badge px-2 py-1 text-13 font-semibold transition-colors',
            danger
              ? 'bg-destructive/10 text-destructive'
              : 'bg-surface-container-high text-foreground hover:bg-surface-container-highest',
          )}
        >
          <SafetyIcon size={14} aria-hidden="true" />
          {safetyLabel}
        </span>
        {score != null && (
          <span className="ml-2 font-mono text-13 tabular-nums text-muted-foreground">
            {score}/100
          </span>
        )}
      </a>

      <FactGrid facts={facts} />
    </div>
  );
}
