import { useTranslation } from 'react-i18next';
import { podcastText } from '../../../supabase/functions/_shared/podcast-text';

interface Props {
  content: string | null;
  notes?: string | null;
  summary?: string | null;
  version?: number;
}

export function PodcastEpisodeText({ content, notes, summary, version }: Props) {
  const { t } = useTranslation();
  // Pending imports and deployments with an older DB remain readable. Never
  // fall back to the unprocessed promotional body when derived text is empty.
  const fallback = version ? null : podcastText(content ?? '');
  const showNotes = fallback?.notes ?? notes ?? '';
  const overview = fallback?.summary ?? summary ?? '';

  return (
    <section aria-label={t('podcasts.overview', 'Episode overview')}>
      <h2 className="mb-2 text-title font-semibold">
        {t('podcasts.overview', 'Episode overview')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('podcasts.summaryBasis', 'Based on the publisher’s show notes.')}
      </p>
      <p className="whitespace-pre-line text-body-lg leading-relaxed text-foreground">
        {overview ||
          t(
            'podcasts.noOverview',
            'The publisher has not provided enough episode detail for an overview.',
          )}
      </p>
      {showNotes && showNotes !== overview && (
        <details className="mt-6 border-t border-border-hairline pt-4">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
            {t('podcasts.showNotes', 'Show notes')}
          </summary>
          <div className="mt-4 whitespace-pre-line break-words text-body-lg leading-relaxed text-foreground">
            {showNotes}
          </div>
        </details>
      )}
    </section>
  );
}
