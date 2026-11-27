import { useTranslation } from 'react-i18next';
import { podcastTranscriptLinks } from '../../../supabase/functions/_shared/podcast-transcripts';

interface Props {
  content: string | null;
  links?: unknown;
}

export function PodcastTranscriptLinks({ content, links }: Props) {
  const { t } = useTranslation();
  const transcripts = podcastTranscriptLinks(content ?? '', links);
  if (!transcripts.length) return null;

  return (
    <section
      className="mt-6 border-t border-border-hairline pt-4"
      aria-label={t('podcasts.transcripts', 'Transcripts')}
    >
      <h2 className="mb-2 text-title font-semibold">{t('podcasts.transcripts', 'Transcripts')}</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        {t('podcasts.transcriptSource', 'Provided by the publisher.')}
      </p>
      <ul className="space-y-2">
        {transcripts.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 flex-wrap items-center gap-x-2 py-2 text-foreground underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {link.scope === 'episode'
                ? t('podcasts.readTranscript', 'Read episode transcript')
                : t('podcasts.browseTranscripts', 'Browse show transcripts')}
              <span className="break-all text-sm text-muted-foreground">
                ({new URL(link.url).hostname}
                {link.type ? ' · ' + link.type.split('/')[1].toUpperCase() : ''}
                {link.language ? ' · ' + link.language : ''})
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
