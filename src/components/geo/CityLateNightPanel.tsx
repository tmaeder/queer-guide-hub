import { useTranslation } from 'react-i18next';
import { FactGrid, type Fact } from '@/components/transit/FactGrid';
import { useCityTransitService } from '@/hooks/useCityTransitService';
import { formatClock, summarizeCityTransit, type LastDeparture } from '@/lib/cityTransit';

/**
 * "If I stay for one more drink, am I stranded?" — the last regular departure
 * and the all-night network, as facts about the city
 * (docs/plans/2026-10-22-zurich-late-night-mobility-design.md). No journey
 * planning and no per-user query: the browser reads one derived table.
 * Renders nothing for a city without data — absence is never shown as "no service".
 */
export function CityLateNightPanel({
  cityId,
  showHeading = true,
}: {
  cityId: string;
  /** Off where the surrounding section already titles it (/going-out). */
  showHeading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { data = [] } = useCityTransitService(cityId);
  const s = summarizeCityTransit(data);
  if (!s) return null;

  const modeLabel: Record<LastDeparture['mode'], string> = {
    tram: t('cities.detail.transit.lastTram', 'Last tram'),
    metro: t('cities.detail.transit.lastMetro', 'Last metro'),
    rail: t('cities.detail.transit.lastTrain', 'Last train'),
    bus: t('cities.detail.transit.lastBus', 'Last bus'),
    ferry: t('cities.detail.transit.lastFerry', 'Last ferry'),
  };
  const weeknight = t('cities.detail.transit.weeknight', 'Sun–Thu');
  const weekend = t('cities.detail.transit.weekend', 'Fri & Sat');

  const facts: Fact[] = [];
  for (const mode of [...new Set(s.last.map((l) => l.mode))]) {
    const parts = s.last
      .filter((l) => l.mode === mode)
      .map((l) => `${l.night === 'weekend' ? weekend : weeknight} ${formatClock(l.lastS)}`);
    facts.push({ label: modeLabel[mode], value: parts.join(' · ') });
  }
  const nightValue = (key: 'weeknight' | 'weekend', label: string) => {
    const n = s.allNight[key];
    return n.count > 0 && n.untilS != null
      ? t('cities.detail.transit.allNightLines', '{{nights}}: {{count}} lines until {{time}}', {
          nights: label,
          count: n.count,
          time: formatClock(n.untilS),
        })
      : t('cities.detail.transit.allNightNone', '{{nights}}: none', { nights: label });
  };
  facts.push({
    label: t('cities.detail.transit.allNight', 'All-night service'),
    value: `${nightValue('weekend', weekend)} · ${nightValue('weeknight', weeknight)}`,
  });
  if (s.punctuality)
    facts.push({
      label: t('cities.detail.transit.onTime', 'On time after 23:00'),
      value: t(
        'cities.detail.transit.onTimeValue',
        '{{pct}}% of tram and bus departures, measured {{period}}',
        { pct: Math.round(s.punctuality.share * 100), period: s.punctuality.period },
      ),
    });

  const validUntil = new Date(s.validUntil).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <section aria-labelledby={showHeading ? 'city-late-night-heading' : undefined}>
      {showHeading && (
        <h3 id="city-late-night-heading" className="text-title font-bold">
          {t('cities.detail.transit.heading', 'Late night')}
        </h3>
      )}
      <FactGrid facts={facts} className={showHeading ? 'mt-2' : undefined} />
      <p className="mt-2 text-13 text-muted-foreground">
        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
          {s.attribution}
        </a>
        {', '}
        {t('cities.detail.transit.validUntil', 'valid until {{date}}', { date: validUntil })}
        {s.punctuality &&
          ` · ${t('cities.detail.transit.punctualitySource', 'Punctuality: Stadt Zürich open data (VBZ); night lines not covered')}`}
      </p>
    </section>
  );
}
