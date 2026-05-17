import { useEffect } from 'react';

/**
 * Global ⌘K / Ctrl+K hotkey. Calls the supplied handler unless the user is
 * already typing into a form field (so we don't hijack admin editors).
 */
export function useSearchHotkey(onTrigger: () => void) {
  useEffect(() => {
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
  }, [onTrigger]);
}
