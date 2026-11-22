import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useEventObservances } from '@/hooks/useObservances';

export function EventObservanceChip({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const { data = [] } = useEventObservances(eventId);
  if (data.length === 0) return null;
  return (
    <p className="m-0 mb-4 text-15">
      {data.map((o, i) => (
        <span key={o.slug}>
          {i > 0 && ' · '}
          <LocalizedLink to={`/days/${o.slug}`}>
            {t('observances.partOf', 'Part of {{name}}', { name: o.name })}
          </LocalizedLink>
        </span>
      ))}
    </p>
  );
}
