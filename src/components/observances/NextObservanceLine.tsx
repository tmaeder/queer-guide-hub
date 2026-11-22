import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useObservancesIndex, type ObservanceIndexRow } from '@/hooks/useObservanceIndex';

/** Pure: the soonest observance whose occurrence starts within `days` of `today` (or has started). */
export function nextObservanceWithin(
  rows: ObservanceIndexRow[],
  today: string,
  days = 14,
): ObservanceIndexRow | null {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // observances_index returns the current occurrence until its after-window closes,
  // so an observance that started yesterday is still `starts <= limit`.
  return (
    rows.filter((r) => r.starts <= limit).sort((a, b) => a.starts.localeCompare(b.starts))[0] ??
    null
  );
}

/**
 * Homepage "Coming up": one line for the next awareness day within 14 days.
 * States the date only — no countdown, because memorial days share this slot.
 */
export function NextObservanceLine() {
  const { t, i18n } = useTranslation();
  const { data = [] } = useObservancesIndex();
  const next = nextObservanceWithin(data, new Date().toISOString().slice(0, 10));
  if (!next) return null;
  const date = new Date(`${next.starts}T12:00:00Z`).toLocaleDateString(i18n.language || 'en', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return (
    <p className="mb-4 text-15">
      <LocalizedLink to={`/days/${next.slug}`} className="font-bold">
        {next.name}
      </LocalizedLink>{' '}
      <span className="text-muted-foreground">
        · {date}
        {next.linked_count > 0
          ? ` · ${t('observances.home.events', '{{count}} events', { count: next.linked_count })}`
          : ''}
      </span>
    </p>
  );
}
