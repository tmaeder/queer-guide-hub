import { Play, Pause, Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import { useAudioPlayer, formatTime } from '@/hooks/useAudioPlayer';

interface PodcastPlayerProps {
  /** news_articles.id — the key playback position is remembered under. */
  articleId: string;
  audioUrl: string;
  title?: string;
  /** Duration from the feed (itunes:duration); used until the audio reports its own. */
  durationSeconds?: number | null;
  showName?: string | null;
  artwork?: string | null;
  href?: string | null;
}

/**
 * The inline transport on an episode page.
 *
 * It owns NO audio element. It used to: a `<audio>` lived here, so navigating
 * away from the article unmounted it and the episode stopped mid-sentence —
 * which is the one thing podcast listening cannot do. The element now lives in
 * AudioPlayerProvider and survives every route change; this is the affordance
 * that hands a track to it and mirrors its state back, but only while this
 * episode is the one loaded.
 *
 * Keeping a single element application-wide is also what guarantees two players
 * can never play over each other.
 */
export function PodcastPlayer({
  articleId,
  audioUrl,
  title,
  durationSeconds,
  showName,
  artwork,
  href,
}: PodcastPlayerProps) {
  const { t } = useTranslation();
  const { play, playing, position, duration, seek, isCurrent } = useAudioPlayer();

  const active = isCurrent(articleId);
  const label = title || t('news.podcastEpisode', 'Podcast episode');
  // Only reflect live progress for the track that is actually loaded; otherwise
  // this row would animate to another episode's position.
  const at = active ? position : 0;
  const total = (active && duration > 0 ? duration : durationSeconds) || 0;

  const start = () =>
    play({
      id: articleId,
      title: label,
      audioUrl,
      durationSeconds,
      showName: showName ?? null,
      artwork: artwork ?? null,
      href: href ?? null,
    });

  return (
    <div className="rounded-element bg-muted/40 p-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={start}
          aria-label={active && playing ? t('audio.pause', 'Pause') : t('audio.play', 'Play')}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
        >
          {active && playing ? (
            <Pause className="size-5" aria-hidden />
          ) : (
            <Play className="size-5 translate-x-px" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-13 text-muted-foreground">
            <Headphones className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </div>
          <Slider
            value={[Math.min(at, total || 1)]}
            min={0}
            max={total || 1}
            step={1}
            // Seeking before this episode is loaded would move whatever IS
            // loaded. Load it first, then seek.
            onValueChange={(v) => {
              if (!active) start();
              else seek(v[0]);
            }}
            aria-label={t('audio.seek', 'Seek')}
            aria-valuetext={t('audio.progress', '{{at}} of {{total}}', {
              at: formatTime(at),
              total: formatTime(total),
            })}
          />
          <div className="mt-1 flex justify-between text-xs2 tabular-nums text-muted-foreground">
            <span>{formatTime(at)}</span>
            <span>{formatTime(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PodcastPlayer;
