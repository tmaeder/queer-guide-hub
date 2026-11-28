import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/icons';
import type { PodcastShow } from '@/hooks/usePodcasts';

/** "Listen on" platform links, only for the ones an editor has filled. */
export function ListenOnLinks({
  show,
}: {
  show: Pick<PodcastShow, 'apple_podcasts_url' | 'spotify_url' | 'youtube_url'>;
}) {
  const { t } = useTranslation();
  const links = [
    { url: show.apple_podcasts_url, label: t('podcasts.applePodcasts', 'Apple Podcasts') },
    { url: show.spotify_url, label: t('podcasts.spotify', 'Spotify') },
    { url: show.youtube_url, label: t('podcasts.youtube', 'YouTube') },
  ].filter((l): l is { url: string; label: string } => Boolean(l.url));
  if (links.length === 0) return null;
  return (
    <div className="mt-4">
      <h2 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
        {t('podcasts.listenOn', 'Listen on')}
      </h2>
      <ul className="mt-1 flex list-none flex-wrap gap-x-4 p-0">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 text-13"
            >
              <ExternalLink className="size-4" aria-hidden />
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
