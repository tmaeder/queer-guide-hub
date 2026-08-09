import * as React from 'react';
import { flushSync } from 'react-dom';

type Theme = 'dark' | 'light' | 'system';

/**
 * Paint the resolved mode onto the document.
 *
 * Extracted so the View Transition callback below can apply it SYNCHRONOUSLY.
 * The effect that used to own this is a passive `useEffect`, which does not run
 * inside `flushSync`, so a transition driven only by React state would snapshot
 * an "after" frame identical to the "before" one and wipe nothing.
 */
const applyMode = (mode: 'light' | 'dark') => {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
  const themeColor = mode === 'dark' ? '#0a0a0a' : '#ffffff';
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = themeColor;
  });
};

/** Origin of the wipe, in viewport px, plus the radius that covers the page. */
const setWipeOrigin = (x: number, y: number) => {
  const { innerWidth: w, innerHeight: h } = window;
  // Furthest corner from the origin — anything smaller leaves an unwiped wedge.
  const radius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  const root = document.documentElement;
  root.style.setProperty('--wipe-x', `${x}px`);
  root.style.setProperty('--wipe-y', `${y}px`);
  root.style.setProperty('--wipe-r', `${radius}px`);
};

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  /** `theme` with "system" resolved to the actual light/dark mode. */
  resolvedTheme: 'light' | 'dark';
  /**
   * `origin` is the viewport point the theme wipe expands from — pass the
   * triggering pointer event's coordinates so the new mode appears to spread
   * from the control the user actually pressed. Optional: omitting it wipes
   * from the viewport centre, which is right for keyboard activation.
   */
  setTheme: (theme: Theme, origin?: { x: number; y: number }) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => null,
};

const ThemeProviderContext = React.createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(
    () =>
      (typeof window !== 'undefined' && (localStorage.getItem(storageKey) as Theme)) ||
      defaultTheme,
  );

  const [systemMode, setSystemMode] = React.useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Listen for system theme changes
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Resolve "system" to actual light/dark
  const resolvedMode = theme === 'system' ? systemMode : theme;

  // Keep HTML class and theme-color meta tag in sync. Still needed for the
  // initial paint and for OS-level `system` changes, which arrive without a
  // click and so never go through the transition path below.
  React.useEffect(() => {
    applyMode(resolvedMode);
  }, [resolvedMode]);

  const value = React.useMemo(
    () => ({
      theme,
      resolvedTheme: resolvedMode,
      setTheme: (newTheme: Theme, origin?: { x: number; y: number }) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, newTheme);
        }

        const nextMode =
          newTheme === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            : newTheme;

        const reduced =
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Feature-detect, and treat reduced motion as "unsupported" so there is
        // exactly one un-animated code path rather than an animated one with the
        // duration set to zero.
        const startViewTransition = (
          document as Document & {
            startViewTransition?: (cb: () => void) => { finished: Promise<void> };
          }
        ).startViewTransition;

        if (typeof window === 'undefined' || reduced || !startViewTransition) {
          setThemeState(newTheme);
          return;
        }

        // Default to the viewport centre when the caller has no pointer position
        // (keyboard activation, programmatic change).
        setWipeOrigin(origin?.x ?? window.innerWidth / 2, origin?.y ?? window.innerHeight / 2);

        startViewTransition.call(document, () => {
          // flushSync so the class flip lands inside the callback; the passive
          // effect above would run after the transition had already snapshotted.
          flushSync(() => setThemeState(newTheme));
          applyMode(nextMode);
        });
      },
    }),
    [theme, resolvedMode, storageKey],
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
