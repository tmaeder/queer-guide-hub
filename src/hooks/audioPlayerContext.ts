import { createContext, useContext } from 'react';

/**
 * Context, types and pure helpers for the single application audio player.
 *
 * WHY A SEPARATE FILE FROM useAudioPlayer.tsx. That file exports the provider
 * component; react-refresh only works when a module exports components alone,
 * so the hooks and constants live here. It also breaks the import cycle the
 * provider had with AudioMiniBar, which consumes the context it is rendered by.
 */

export interface AudioTrack {
  /** news_articles.id — the key playback position is stored under. */
  id: string;
  title: string;
  audioUrl: string;
  /** From the feed (itunes:duration); used until the media reports its own. */
  durationSeconds?: number | null;
  /** Show name, for the mini-bar line and the OS lock screen. */
  showName?: string | null;
  artwork?: string | null;
  /** Where the mini-bar's title links to. */
  href?: string | null;
}

export type AudioError = 'network' | 'decode' | 'unsupported' | 'aborted' | null;

export interface AudioPlayerValue {
  current: AudioTrack | null;
  playing: boolean;
  position: number;
  duration: number;
  rate: number;
  error: AudioError;
  /** Load and play a track. Re-calling with the loaded track toggles instead. */
  play: (track: AudioTrack) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  /** Relative jump; negative goes back. */
  skip: (delta: number) => void;
  cycleRate: () => void;
  stop: () => void;
  isCurrent: (id: string) => boolean;
}

export const AudioPlayerContext = createContext<AudioPlayerValue | null>(null);

export const SKIP_SECONDS = 15;
export const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75] as const;

export function useAudioPlayer(): AudioPlayerValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used inside <AudioPlayerProvider>');
  return ctx;
}

/**
 * Non-throwing variant for components that may render outside the provider
 * (unit tests, the admin shell). Returns null instead of exploding.
 */
export function useAudioPlayerOptional(): AudioPlayerValue | null {
  return useContext(AudioPlayerContext);
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}
