import type { ReactNode } from 'react';
import { ShieldCheck, ShieldAlert, Skull } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui/Eyebrow';
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

  const danger = report.hasDeathPenaltyDestination || report.hasCriminalizedDestination;
  const SafetyIcon = report.hasDeathPenaltyDestination
    ? Skull
    : report.hasCriminalizedDestination
      ? ShieldAlert
      : ShieldCheck;
  const safetyLabel = report.hasDeathPenaltyDestination
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

  return (
    <div className="rounded-container border border-border/60 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        <a
          href="#rights"
          className="col-span-2 block no-underline sm:col-span-1"
          aria-label={t('cities.detail.glance.safetyLink', 'Jump to safety & rights')}
        >
          <Eyebrow as="div" className="mb-2">
            {t('cities.detail.glance.safety', 'Safety')}
          </Eyebrow>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-badge border px-2 py-1 text-13 font-semibold transition-colors',
              danger
                ? 'border-destructive/30 bg-destructive/5 text-destructive'
                : 'border-border text-foreground hover:bg-muted',
            )}
          >
            <SafetyIcon size={14} aria-hidden="true" />
            {safetyLabel}
          </span>
          {score != null && (
            <span className="ml-2 text-13 text-muted-foreground">{score}/100</span>
          )}
        </a>

        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <Eyebrow as="div" className="mb-2">
              {f.label}
            </Eyebrow>
            <p className="truncate text-15 font-semibold text-foreground">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
