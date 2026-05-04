import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'qg_safe_mode';

// Parent + leaf categories considered adult content. Match the strings
// used in src/components/resources/categoryMeta.ts so a future enum
// (P2-1) can replace this list without changing the gate semantics.
const ADULT_CATEGORIES: ReadonlySet<string> = new Set([
  'Sexuality & Kink',
  'Sexual Roles',
  'BDSM & Power Exchange',
  'Fetishes & Interests',
  'Practices & Play',
  'Gear & Aesthetics',
  'Body Types & Archetypes',
]);

type SafeMode = 'on' | 'off';

interface SafeModeCtx {
  mode: SafeMode;
  setMode: (next: SafeMode) => void;
  toggle: () => void;
  /** True iff Safe mode is on. Convenience for filter call sites. */
  enabled: boolean;
  /** Returns true if a category (parent or leaf) is adult-content. */
  isAdultCategory: (name: string | null | undefined) => boolean;
  /** Returns true if a tag with the given category list should be hidden in Safe mode. */
  shouldHide: (categoryNames: ReadonlyArray<string | null | undefined>) => boolean;
}

const Ctx = createContext<SafeModeCtx | null>(null);

function readStored(): SafeMode {
  if (typeof localStorage === 'undefined') return 'on';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'off' ? 'off' : 'on';
  } catch {
    return 'on';
  }
}

export function SafeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SafeMode>(() => readStored());

  const setMode = useCallback((next: SafeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best effort — fall back to in-memory state.
    }
    setModeState(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === 'on' ? 'off' : 'on');
  }, [mode, setMode]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setModeState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<SafeModeCtx>(() => {
    const isAdultCategory = (name: string | null | undefined): boolean =>
      !!name && ADULT_CATEGORIES.has(name);
    const shouldHide = (categoryNames: ReadonlyArray<string | null | undefined>): boolean =>
      mode === 'on' && categoryNames.some(isAdultCategory);
    return {
      mode,
      setMode,
      toggle,
      enabled: mode === 'on',
      isAdultCategory,
      shouldHide,
    };
  }, [mode, setMode, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSafeMode(): SafeModeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSafeMode must be used inside SafeModeProvider');
  return ctx;
}
