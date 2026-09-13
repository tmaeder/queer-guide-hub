import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AudioMiniBar } from '@/components/audio/AudioMiniBar';

/**
 * The one audio element in the application.
 *
 * WHY A PROVIDER AND NOT A PER-PAGE PLAYER. `PodcastPlayer` mounted its own
 * `<audio>` inside the article page, so navigating away unmounted it and the
 * episode stopped mid-sentence. Podcast listening is the one thing on this site
 * that has to outlive a route change.
 *
 * WHY CONTEXT AND NOT A STORE. There is no state library in package.json and no
 * src/stores/. Every piece of global state here is a context in src/hooks/*.tsx
 * — useAuth, useCurrency, useCookieConsent, useActiveTrip. Adding zustand for
 * one feature would be the only one of its kind.
 *
 * The element is rendered here, never by a consumer. That is the guarantee that
 * two players can never fight over the same output.
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

type AudioError = 'network' | 'decode' | 'unsupported' | 'aborted' | null;

interface AudioPlayerValue {
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

const AudioPlayerContext = createContext<AudioPlayerValue | null>(null);

export const SKIP_SECONDS = 15;
export const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75] as const;

const PROGRESS_KEY = 'qg.audio.progress';
const RATE_KEY = 'qg.audio.rate';
/** Positions kept for at most this many episodes; oldest evicted. */
const PROGRESS_LIMIT = 100;
/** Within this many seconds of the end, the episode is finished, not paused. */
const FINISHED_TAIL = 30;
const SAVE_THROTTLE_MS = 5000;

// ponytail: device-local resume. localStorage matches every other per-user
// preference in this codebase (useAdminNavPins, useHotlineBookmarks,
// useFilterPresets, useMapShellState) and nobody has asked for cross-device.
// Upgrade path when they do: a user_audio_progress table shaped exactly like
// user_news_reads in 20260524220002_news_editorial.sql — PK (user_id,
// article_id), three self-scoped RLS policies — upserted from this same hook
// behind useAuth().user. NOT a profiles column: that table's authenticated
// role holds a 52-column write allowlist and five security_invoker views read
// it, so a jsonb blob there is the most expensive available option.
type ProgressMap = Record<string, number>;

function readProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as ProgressMap) : {};
  } catch {
    return {};
  }
}

function writeProgress(id: string, seconds: number | null) {
  try {
    const map = readProgress();
    if (seconds === null) delete map[id];
    else map[id] = Math.floor(seconds);
    // Insertion order is the eviction order. Object key order is stable for
    // string keys, which is all this needs — it is a cache, not a ledger.
    const keys = Object.keys(map);
    if (keys.length > PROGRESS_LIMIT) {
      for (const k of keys.slice(0, keys.length - PROGRESS_LIMIT)) delete map[k];
    }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch {
    /* private mode / quota — playback still works, it just will not resume */
  }
}

function readRate(): number {
  try {
    const n = Number(localStorage.getItem(RATE_KEY));
    return RATES.includes(n as (typeof RATES)[number]) ? n : 1;
  } catch {
    return 1;
  }
}

/** MediaError.code → a message key. `stalled` and `abort` are NOT errors. */
function classifyError(code: number | undefined): AudioError {
  switch (code) {
    case 1:
      return 'aborted';
    case 2:
      return 'network';
    case 3:
      return 'decode';
    case 4:
      return 'unsupported';
    default:
      return 'network';
  }
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<AudioTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(() => readRate());
  const [error, setError] = useState<AudioError>(null);

  const lastSaveRef = useRef(0);
  // The track the element is actually loaded with. Read inside listeners and
  // media-element callbacks, which must not close over a stale `current`.
  //
  // Written by play() and stop() ONLY, never during render: mutating a ref
  // while rendering is the react-hooks/refs violation, and there is no path
  // that changes `current` without going through one of those two.
  const currentRef = useRef<AudioTrack | null>(null);

  const savePosition = useCallback((force = false) => {
    const el = audioRef.current;
    const track = currentRef.current;
    if (!el || !track) return;
    const now = Date.now();
    if (!force && now - lastSaveRef.current < SAVE_THROTTLE_MS) return;
    lastSaveRef.current = now;
    const d = el.duration;
    // Finished is not paused. Without this the next visit resumes at 99% and
    // plays the outro.
    if (Number.isFinite(d) && d > 0 && d - el.currentTime <= FINISHED_TAIL) {
      writeProgress(track.id, null);
    } else if (el.currentTime > 5) {
      writeProgress(track.id, el.currentTime);
    }
  }, []);

  const play = useCallback(
    (track: AudioTrack) => {
      const el = audioRef.current;
      if (!el) return;

      if (currentRef.current?.id === track.id) {
        if (el.paused) void el.play();
        else el.pause();
        return;
      }

      savePosition(true);
      setError(null);
      setCurrent(track);
      currentRef.current = track;
      setDuration(track.durationSeconds ?? 0);
      el.src = track.audioUrl;
      el.playbackRate = rate;
      const resumeAt = readProgress()[track.id] ?? 0;
      setPosition(resumeAt);
      el.load();
      if (resumeAt > 0) {
        const onReady = () => {
          try {
            el.currentTime = resumeAt;
          } catch {
            /* seeking before the media is seekable — start from 0 */
          }
          el.removeEventListener('loadedmetadata', onReady);
        };
        el.addEventListener('loadedmetadata', onReady);
      }
      void el.play().catch(() => {
        // Autoplay policy or a dead URL. The `error` listener covers the
        // second; a rejected play() with no media error is the first, and the
        // honest UI for it is a paused player, not an error.
        setPlaying(false);
      });
    },
    [rate, savePosition],
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !currentRef.current) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(seconds)) return;
    const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
    el.currentTime = Math.max(0, Math.min(seconds, d));
    setPosition(el.currentTime);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const el = audioRef.current;
      if (!el) return;
      seek(el.currentTime + delta);
    },
    [seek],
  );

  const cycleRate = useCallback(() => {
    setRate((prev) => {
      const i = RATES.indexOf(prev as (typeof RATES)[number]);
      const next = RATES[(i + 1) % RATES.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      try {
        localStorage.setItem(RATE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      savePosition(true);
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setCurrent(null);
    currentRef.current = null;
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    setError(null);
  }, [savePosition]);

  const isCurrent = useCallback((id: string) => currentRef.current?.id === id, []);

  // Persist on the way out. `pagehide` rather than `beforeunload`: it is the
  // only one that fires reliably on iOS, where a listener is most needed.
  useEffect(() => {
    const onHide = () => savePosition(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      savePosition(true);
    };
  }, [savePosition]);

  // ── Media Session: OS / lock-screen controls ───────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: current.title,
        artist: current.showName ?? 'Queer Guide',
        album: 'Queer Guide',
        artwork: current.artwork ? [{ src: current.artwork, sizes: '512x512' }] : [],
      });
    } catch {
      /* older Safari has mediaSession without MediaMetadata */
    }
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => toggle()],
      ['pause', () => toggle()],
      ['stop', () => stop()],
      ['seekbackward', () => skip(-SKIP_SECONDS)],
      ['seekforward', () => skip(SKIP_SECONDS)],
      ['seekto', (d) => typeof d.seekTime === 'number' && seek(d.seekTime)],
    ];
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* the browser does not implement this action */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [current, toggle, stop, skip, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch {
      /* ignore */
    }
  }, [playing]);

  const value = useMemo<AudioPlayerValue>(
    () => ({
      current,
      playing,
      position,
      duration,
      rate,
      error,
      play,
      toggle,
      seek,
      skip,
      cycleRate,
      stop,
      isCurrent,
    }),
    [
      current,
      playing,
      position,
      duration,
      rate,
      error,
      play,
      toggle,
      seek,
      skip,
      cycleRate,
      stop,
      isCurrent,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        // crossOrigin is deliberately UNSET. Podcast CDNs rarely send
        // Access-Control-Allow-Origin, and requesting CORS on a plain <audio>
        // turns a working stream into a failed one for no gain — nothing here
        // reads the waveform.
        onPlay={() => {
          setPlaying(true);
          setError(null);
        }}
        onPause={() => {
          setPlaying(false);
          savePosition(true);
        }}
        onTimeUpdate={(e) => {
          setPosition(e.currentTarget.currentTime);
          savePosition();
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          // A stream with no Content-Length reports Infinity. Keep the feed's
          // figure in that case rather than rendering "Infinity:NaN".
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onEnded={() => {
          setPlaying(false);
          if (currentRef.current) writeProgress(currentRef.current.id, null);
        }}
        // ONLY `error`. `stalled`, `waiting` and `abort` fire constantly on a
        // mobile connection and are not failures — treating them as such would
        // put an error banner over a stream that is merely buffering.
        onError={(e) => {
          setPlaying(false);
          setError(classifyError(e.currentTarget.error?.code));
        }}
      />
      <AudioMiniBar />
    </AudioPlayerContext.Provider>
  );
}

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
