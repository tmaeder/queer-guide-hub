import { useTranslation } from 'react-i18next';
import { Play, Pause } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cleanTitle } from '@/utils/htmlDecode';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import type { PodcastEpisode } from '@/hooks/usePodcasts';

interface EpisodeRowProps {
  episode: PodcastEpisode;
  showName?: string | null;
  artwork?: string | null;
}

function durationLabel(seconds: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/**
 * One episode, playable in place.
 *
 * The play button is a SIBLING of the title link, never a child of it — a
 * button inside an anchor is `nested-interactive` (axe, serious, WCAG 4.1.2),
 * which is the same rule the card-overlay pattern exists to satisfy.
 */
export function EpisodeRow({ episode, showName, artwork }: EpisodeRowProps) {
  const { t } = useTranslation();
  const { play, playing, isCurrent } = useAudioPlayer();

  const active = isCurrent(episode.id);
  const title = cleanTitle(episode.title);
  const dur = durationLabel(episode.duration_seconds);
  const when = episode.published_at
    ? formatDistanceToNow(new Date(episode.published_at), { addSuffix: true })
    : null;

  return (
    <li className="flex items-center gap-4 rounded-element p-2 transition-colors hover:bg-muted/50">
      {episode.audio_url ? (
        <button
          type="button"
          onClick={() =>
            play({
              id: episode.id,
              title,
              audioUrl: episode.audio_url!,
              durationSeconds: episode.duration_seconds,
              showName: showName ?? null,
              artwork: artwork ?? episode.image_url ?? null,
              href: `/news/${episode.slug}`,
            })
          }
          aria-label={
            active && playing
              ? t('audio.pauseEpisode', 'Pause {{title}}', { title })
              : t('audio.playEpisode', 'Play {{title}}', { title })
          }
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-track-ring bg-track-pink text-foreground transition-opacity hover:opacity-90"
        >
          {active && playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4 translate-x-px" aria-hidden />
          )}
        </button>
      ) : (
        <div className="size-10 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <LocalizedLink
          to={`/news/${episode.slug}`}
          className="block truncate text-15 font-bold no-underline text-inherit hover:underline"
        >
          {title}
        </LocalizedLink>
        <p className="truncate text-2xs uppercase tracking-wider text-muted-foreground">
          {[when, dur].filter(Boolean).join(' · ')}
        </p>
      </div>
    </li>
  );
}

export default EpisodeRow;
