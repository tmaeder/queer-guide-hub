import { useEffect } from 'react';

/**
 * Global ⌘K / Ctrl+K hotkey. Calls the supplied handler unless the user is
 * already typing into a form field (so we don't hijack admin editors).
 *
 * `enabled` exists because the listener is GLOBAL while the hook is per-mount.
 * The homepage now mounts a second search in the hero, and two registered
 * owners would open both popovers and race each other's focus. The disabled
 * mount must not bind at all — an inert callback still leaves a listener
 * attached, which is indistinguishable from the bug when you go looking.
 */
export function useSearchHotkey(onTrigger: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (!isCmdK) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target?.isContentEditable ?? false);
      // Allow ⌘K from inside an input *only* if it's already the search input.
      if (editable && target?.getAttribute('role') !== 'combobox') return;
      e.preventDefault();
      onTrigger();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTrigger, enabled]);
}
