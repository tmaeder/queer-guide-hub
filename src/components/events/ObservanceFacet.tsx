import { useTranslation } from 'react-i18next';
import { useObservancesIndex } from '@/hooks/useObservanceIndex';
import { facetOptions } from '@/lib/observanceView';

/** /events: narrow the feed to the events linked to one upcoming awareness day. */
export function ObservanceFacet({
  value,
  onChange,
}: {
  value: string;
  onChange: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const { data = [] } = useObservancesIndex();
  const options = facetOptions(data, value, new Date().toISOString().slice(0, 10));
  if (options.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('observances.facet.label', 'Awareness day')}
      className="mb-4 flex flex-wrap gap-2"
    >
      {options.map((o) => (
        <button
          key={o.slug}
          type="button"
          aria-pressed={value === o.slug}
          onClick={() => onChange(value === o.slug ? '' : o.slug)}
          className={
            value === o.slug
              ? 'rounded-badge bg-foreground px-4 py-1 text-13 font-bold text-background'
              : 'rounded-badge px-4 py-1 text-13 text-muted-foreground hover:text-foreground'
          }
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}
