import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useObservancesIndex } from '@/hooks/useObservanceIndex';
import { nextObservanceWithin } from '@/lib/observanceView';

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
