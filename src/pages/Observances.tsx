import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useMeta } from '@/hooks/useMeta';
import { useObservancesIndex, type ObservanceIndexRow } from '@/hooks/useObservanceIndex';
import { observanceDatesText } from '@/lib/observanceView';

/**
 * /days — every published observance, soonest first. The next three are pinned.
 * Counts come from observances_index(), which runs under the reader's RLS.
 * No countdown copy anywhere: memorial days share this list.
 */

function Row({ row, lang }: { row: ObservanceIndexRow; lang: string }) {
  const { t } = useTranslation();
  const year = row.starts.slice(0, 4);
  return (
    <li className="relative border-b border-border-hairline">
      <div className="flex items-baseline gap-4 py-4">
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{row.name}</span>
          <span className="block text-13 text-muted-foreground">
            {observanceDatesText(row, lang)}
          </span>
        </span>
        <span className="shrink-0 text-13 text-muted-foreground">
          {t('observances.index.count', '{{count}} events listed for {{year}}', {
            count: row.linked_count,
            year,
          })}
        </span>
      </div>
      {/* Row-wide link as an overlay sibling, never a wrapper. */}
      <LocalizedLink
        to={`/days/${row.slug}`}
        aria-label={row.name}
        className="absolute inset-0 rounded-element no-underline"
      />
    </li>
  );
}

export default function Observances() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const { data = [], isLoading, isError } = useObservancesIndex();

  useMeta({
    title: t('observances.index.metaTitle', 'LGBTQ+ Awareness Days and Observances'),
    description: t(
      'observances.index.metaDescription',
      'World AIDS Day, Trans Day of Remembrance, IDAHOBIT, Coming Out Day and other LGBTQ+ observances: dates by country and events near you.',
    ),
    canonicalPath: '/days',
  });

  const next = data.slice(0, 3);
  const rest = data.slice(3);

  return (
    <PageContainer>
      <Eyebrow>{t('observances.index.eyebrow', 'Awareness days')}</Eyebrow>
      <h1 className="text-display font-display">
        {t('observances.index.title', 'Awareness days and observances')}
      </h1>
      <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
        {t(
          'observances.index.intro',
          'The days the community marks each year, soonest first. Each one lists its date for your country and the events and news linked to it.',
        )}
      </p>

      {isLoading && (
        <div className="mt-12 flex justify-center">
          <TrackLoader />
        </div>
      )}
      {isError && (
        <p className="mt-12 text-body-lg">
          {t('observances.index.loadFailed', 'This list could not be loaded right now.')}
        </p>
      )}

      {next.length > 0 && (
        <section aria-labelledby="days-next" className="mt-12">
          <h2 id="days-next" className="text-headline font-display">
            {t('observances.index.next', 'Next up')}
          </h2>
          <ul className="mt-4 list-none p-0">
            {next.map((r) => (
              <Row key={r.id} row={r} lang={lang} />
            ))}
          </ul>
        </section>
      )}
      {rest.length > 0 && (
        <section aria-labelledby="days-later" className="mt-12">
          <h2 id="days-later" className="text-headline font-display">
            {t('observances.index.later', 'Later in the year')}
          </h2>
          <ul className="mt-4 list-none p-0">
            {rest.map((r) => (
              <Row key={r.id} row={r} lang={lang} />
            ))}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
