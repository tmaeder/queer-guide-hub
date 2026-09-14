import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAdminRoles } from '@/hooks/useAdminRoles';

const PIN_KEY = 'admin-inline-edit-pinned';

interface AdminEditModeValue {
  /** True only when the current user can manage content (admin/moderator). */
  isAdmin: boolean;
  /** True while the Alt (Option) key is held — toggles edit affordance. */
  altHeld: boolean;
  /** True when the admin has pinned inline editing on from the toolbar. */
  pinned: boolean;
  /**
   * The thing every consumer actually wants: "should the inline edit
   * affordance be live right now". Alt-hold OR the pin.
   */
  editMode: boolean;
  setPinned: (next: boolean) => void;
}

const AdminEditModeContext = createContext<AdminEditModeValue>({
  isAdmin: false,
  altHeld: false,
  pinned: false,
  editMode: false,
  setPinned: () => {},
});

/**
 * Inline editing used to be reachable ONLY by holding Alt, which is not
 * discoverable: nothing on the page said the key existed, so the feature was
 * effectively invisible unless you already knew about it. The pin makes it a
 * visible toggle in the admin toolbar.
 *
 * Alt-hold is kept and is deliberately unchanged — this is additive, and
 * holding Alt is still the fast path for a one-off edit without leaving the
 * toggle on.
 *
 * sessionStorage, not localStorage: leaving every public page permanently
 * dashed-outlined across days is a worse default than re-arming per session.
 * Reads are wrapped because storage throws in a private window.
 */
export function AdminEditModeProvider({ children }: { children: ReactNode }) {
  const { canManageContent, loading } = useAdminRoles();
  const isAdmin = !loading && canManageContent();
  const [altHeld, setAltHeld] = useState(false);

  // Read once, lazily, rather than from an effect. An effect would setState
  // synchronously on mount — a cascading render for a value that is knowable
  // before the first one.
  //
  // It is deliberately NOT gated on `isAdmin` here: the role is not known at
  // first render, and gating the READ would mean an effect again. The gate
  // that matters is on the exposed value below, which is re-applied on every
  // read and therefore also covers a role revoked mid-session — the case a
  // mount-time guard cannot see.
  const [pinned, setPinnedState] = useState(() => {
    try {
      return sessionStorage.getItem(PIN_KEY) === '1';
    } catch {
      /* private window / blocked storage — default off */
      return false;
    }
  });

  const setPinned = useCallback((next: boolean) => {
    setPinnedState(next);
    try {
      if (next) sessionStorage.setItem(PIN_KEY, '1');
      else sessionStorage.removeItem(PIN_KEY);
    } catch {
      /* the toggle still works for this page view */
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isAdmin]);

  // A non-admin is never in edit mode whatever is left in sessionStorage —
  // the pin is a convenience, never the gate.
  const value = useMemo(
    () => ({
      isAdmin,
      altHeld,
      pinned: isAdmin && pinned,
      editMode: isAdmin && (altHeld || pinned),
      setPinned,
    }),
    [isAdmin, altHeld, pinned, setPinned],
  );
  return <AdminEditModeContext.Provider value={value}>{children}</AdminEditModeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminEditMode(): AdminEditModeValue {
  return useContext(AdminEditModeContext);
}
