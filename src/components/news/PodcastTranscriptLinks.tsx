import { useTranslation } from 'react-i18next';
import { podcastTranscriptLinks } from '../../../supabase/functions/_shared/podcast-transcripts';

interface Props {
  content: string | null;
  links?: unknown;
}

export function PodcastTranscriptLinks({ content, links }: Props) {
  const { t } = useTranslation();
  const formats: Record<string, string> = {
    'text/html': 'HTML',
    'text/plain': 'TXT',
    'application/pdf': 'PDF',
    'text/vtt': 'VTT',
    'application/x-subrip': 'SRT',
    'application/srt': 'SRT',
    'application/json': 'JSON',
  };
  const priority = ['text/html', 'text/plain', 'application/pdf', 'text/vtt'];
  const rank = (type?: string) =>
    type ? (priority.includes(type) ? priority.indexOf(type) : 4) : 0;
  const transcripts = podcastTranscriptLinks(content ?? '', links).sort(
    (a, b) =>
      (a.scope === 'episode' ? 0 : 1) - (b.scope === 'episode' ? 0 : 1) ||
      rank(a.type) - rank(b.type),
  );
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
                {link.type ? ' · ' + formats[link.type] : ''}
                {link.language ? ' · ' + link.language : ''})
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
