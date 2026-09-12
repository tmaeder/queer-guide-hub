import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Play, Pause, X, RotateCcw, RotateCw, AlertTriangle } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Slider } from '@/components/ui/slider';
import { isAdminRoute, isMapRoute } from '@/lib/locale';
import { useMotionTokens } from '@/lib/motion';
import { useAudioPlayerOptional, formatTime, SKIP_SECONDS } from '@/hooks/useAudioPlayer';
import { cn } from '@/lib/utils';

/**
 * The docked transport bar. Rendered by AudioPlayerProvider, never by a page.
 *
 * COLLISION WITH THE MOBILE NAV is already a solved problem in this codebase:
 * MapRail publishes `--map-rail-clearance` on documentElement and FeedbackButton
 * / BackToTopButton consume it in their `bottom` calc. This bar does the same
 * with `--audio-bar-clearance`, so those two FABs ride above it without either
 * knowing the bar exists. Published while mounted, removed on unmount.
 *
 * DOM ORDER: the provider renders this AFTER the whole app, which is what keeps
 * LayoutShell untouched — and is why the bar carries role="region" and a label,
 * so a screen-reader user can reach it directly instead of tabbing past every
 * other landmark.
 */

/** Bar height + gap. Kept in sync with the padding below by eye, not by JS —
 *  a ResizeObserver here would be three more moving parts for four pixels. */
const BAR_CLEARANCE = '5rem';

export function AudioMiniBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { reduced } = useMotionTokens();
  const player = useAudioPlayerOptional();
  const current = player?.current ?? null;

  const hidden = !current || isAdminRoute(pathname) || isMapRoute(pathname);

  useEffect(() => {
    const root = document.documentElement;
    if (hidden) {
      root.style.removeProperty('--audio-bar-clearance');
      return;
    }
    root.style.setProperty('--audio-bar-clearance', BAR_CLEARANCE);
    return () => root.style.removeProperty('--audio-bar-clearance');
  }, [hidden]);

  if (!player || hidden || !current) return null;

  const { playing, position, duration, rate, error, toggle, seek, skip, cycleRate, stop } = player;
  const max = duration > 0 ? duration : (current.durationSeconds ?? 0) || 1;

  return (
    <div
      role="region"
      aria-label={t('audio.playerLabel', 'Podcast player')}
      className={cn(
        'fixed inset-x-0 z-30 mx-auto w-full max-w-3xl px-4',
        // The bar must never take focus when it appears — it is the result of
        // the user's own click, and stealing focus loses their place on the page.
        !reduced && 'motion-safe:animate-in motion-safe:slide-in-from-bottom-2',
      )}
      style={{
        bottom: 'calc(var(--island-inset, 0px) + env(safe-area-inset-bottom, 0px) + 4.5rem)',
      }}
    >
      <div className="rounded-container bg-card shadow-soft-lg">
        {error ? (
          // aria-live on the ERROR ROW ONLY. Announcing the timecode would
          // speak once a second and make the page unusable with a screen reader.
          <div aria-live="polite" className="flex items-center gap-2 p-4">
            <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden />
            <p className="min-w-0 flex-1 text-13">
              {t('audio.error', "This episode could not be played. The show's server may be down.")}
            </p>
            <button
              type="button"
              onClick={() => current && player.play(current)}
              className="shrink-0 rounded-element border border-input px-4 py-2 text-13 font-bold"
            >
              {t('audio.retry', 'Retry')}
            </button>
            <button
              type="button"
              onClick={stop}
              aria-label={t('audio.close', 'Close player')}
              className="shrink-0 rounded-full p-2 hover:bg-muted"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 sm:gap-4 sm:p-4">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? t('audio.pause', 'Pause') : t('audio.play', 'Play')}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
            >
              {playing ? (
                <Pause className="size-5" aria-hidden />
              ) : (
                <Play className="size-5 translate-x-px" aria-hidden />
              )}
            </button>

            <button
              type="button"
              onClick={() => skip(-SKIP_SECONDS)}
              aria-label={t('audio.back15', 'Back {{n}} seconds', { n: SKIP_SECONDS })}
              className="hidden size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted sm:flex"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => skip(SKIP_SECONDS)}
              aria-label={t('audio.forward15', 'Forward {{n}} seconds', { n: SKIP_SECONDS })}
              className="hidden size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted sm:flex"
            >
              <RotateCw className="size-4" aria-hidden />
            </button>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline gap-2">
                {current.href ? (
                  <LocalizedLink
                    to={current.href}
                    className="min-w-0 truncate text-13 font-bold no-underline text-inherit hover:underline"
                  >
                    {current.title}
                  </LocalizedLink>
                ) : (
                  <span className="min-w-0 truncate text-13 font-bold">{current.title}</span>
                )}
                {current.showName && (
                  <span className="hidden shrink-0 truncate text-2xs uppercase tracking-wider text-muted-foreground sm:inline">
                    {current.showName}
                  </span>
                )}
              </div>
              <Slider
                value={[Math.min(position, max)]}
                min={0}
                max={max}
                step={1}
                onValueChange={(v) => seek(v[0])}
                aria-label={t('audio.seek', 'Seek')}
                aria-valuetext={t('audio.progress', '{{at}} of {{total}}', {
                  at: formatTime(position),
                  total: formatTime(max),
                })}
              />
              <div className="mt-0.5 flex justify-between text-3xs tabular-nums text-muted-foreground">
                <span>{formatTime(position)}</span>
                <span>{formatTime(max)}</span>
              </div>
            </div>

            {/* A cycling button, not a dropdown: six values do not justify a
                menu, a trigger and a portal. */}
            <button
              type="button"
              onClick={cycleRate}
              aria-label={t('audio.speed', 'Playback speed, currently {{rate}}×', { rate })}
              className="shrink-0 rounded-element px-2 py-1 text-13 font-bold tabular-nums hover:bg-muted"
            >
              {rate}×
            </button>

            <button
              type="button"
              onClick={stop}
              aria-label={t('audio.close', 'Close player')}
              className="shrink-0 rounded-full p-2 hover:bg-muted"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AudioMiniBar;
