import { useRef, useState, useCallback } from 'react';
import { Play, Pause, Headphones } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useTranslation } from 'react-i18next';

interface PodcastPlayerProps {
  audioUrl: string;
  title?: string;
  /** Duration from the feed (itunes:duration); used until the audio reports its own. */
  durationSeconds?: number | null;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Lightweight inline player for a single external podcast enclosure URL.
 * Streams directly from the publisher's CDN — no re-hosting. For multi-codec
 * R2-hosted audio use ModernAudioPlayer instead.
 */
export function PodcastPlayer({ audioUrl, title, durationSeconds }: PodcastPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  const onSeek = useCallback((value: number[]) => {
    const el = audioRef.current;
    if (el && isFinite(value[0])) {
      el.currentTime = value[0];
      setCurrent(value[0]);
    }
  }, []);

  return (
    <div className="rounded-element border bg-muted/40 p-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t('common.pause', 'Pause') : t('common.play', 'Play')}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-13 text-muted-foreground">
            <Headphones className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{title || t('news.podcastEpisode', 'Podcast episode')}</span>
          </div>
          <Slider
            value={[current]}
            min={0}
            max={duration || 1}
            step={1}
            onValueChange={onSeek}
            aria-label={t('news.seek', 'Seek')}
          />
          <div className="mt-1 flex justify-between text-xs2 tabular-nums text-muted-foreground">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

export default PodcastPlayer;
