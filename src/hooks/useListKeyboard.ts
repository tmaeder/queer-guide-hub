/**
 * useListKeyboard — keyboard navigation for any admin list. J/K (and arrow
 * keys) move a cursor over `items`; an `actions` map binds extra keys to
 * handlers. Typing in an input/textarea/select is always ignored.
 *
 * Generalized from the triage queue's keyboard handling so the same J/K +
 * action-key feel works on data-table lists too (useTriageKeyboard is now a
 * thin wrapper over this).
 */
import { useEffect, useCallback } from 'react';

interface UseListKeyboardOptions {
  items: { id: string }[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  /** Extra key bindings. Keys match KeyboardEvent.key (e.g. 'a', ' ', 'Enter').
   *  preventDefault is applied automatically when a binding fires. */
  actions?: Record<string, () => void>;
  enabled: boolean;
}

export function useListKeyboard({
  items,
  activeId,
  onNavigate,
  actions,
  enabled,
}: UseListKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const idx = items.findIndex((i) => i.id === activeId);

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = idx < items.length - 1 ? items[idx + 1] : items[idx];
        if (next) onNavigate(next.id);
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = idx > 0 ? items[idx - 1] : items[idx];
        if (prev) onNavigate(prev.id);
        return;
      }

      const action = actions?.[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    },
    [items, activeId, onNavigate, actions, enabled],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
