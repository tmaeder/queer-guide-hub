import { useEffect, useRef } from 'react';

interface Handlers {
  onFocusSearch: () => void;
  onOpenPalette: () => void;
  onOpenHelp: () => void;
  onEscape: () => void;
  onMoveCard: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onOpenFocused: () => void;
  onSetStatusIndex: (i: number) => void;
  onSetPriority: (v: number) => void;
  onAssignPicker: () => void;
  onForwardFocused: () => void;
  onToggleSelectFocused: (shift: boolean) => void;
}

/**
 * Global keyboard layer for /admin/feedback.
 *
 * Gated on document.activeElement not being a form input so typing into the
 * search field or notes textarea doesn't trigger shortcuts.
 */
export function useFeedbackShortcuts(enabled: boolean, handlers: Handlers) {
  const priorityPendingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      // Command palette + help always pass through the typing guard.
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handlers.onOpenPalette();
        return;
      }

      if (e.key === 'Escape') {
        handlers.onEscape();
        return;
      }

      if (isTyping()) return;

      if (e.key === '/') {
        e.preventDefault();
        handlers.onFocusSearch();
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        handlers.onOpenHelp();
        return;
      }

      // Priority chord: `p` then 0-3
      if (priorityPendingRef.current) {
        if (/^[0-3]$/.test(e.key)) {
          handlers.onSetPriority(Number(e.key));
          priorityPendingRef.current = false;
          e.preventDefault();
          return;
        }
        priorityPendingRef.current = false;
      }

      switch (e.key) {
        case 'j':
          handlers.onMoveCard('down');
          break;
        case 'k':
          handlers.onMoveCard('up');
          break;
        case 'h':
          handlers.onMoveCard('left');
          break;
        case 'l':
          handlers.onMoveCard('right');
          break;
        case 'e':
          handlers.onOpenFocused();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          handlers.onSetStatusIndex(Number(e.key) - 1);
          break;
        case 'p':
          priorityPendingRef.current = true;
          // Reset chord after 1s so it doesn't stick.
          setTimeout(() => {
            priorityPendingRef.current = false;
          }, 1000);
          break;
        case 'a':
          handlers.onAssignPicker();
          break;
        case 'f':
          handlers.onForwardFocused();
          break;
        case 'x':
          handlers.onToggleSelectFocused(e.shiftKey);
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, handlers]);
}

export const shortcutHelp: Array<{ key: string; label: string }> = [
  { key: 'j / k', label: 'Next / previous card in column' },
  { key: 'h / l', label: 'Previous / next column' },
  { key: '1–5', label: 'Set status of focused card' },
  { key: 'p then 0–3', label: 'Set priority' },
  { key: 'a', label: 'Assignee picker' },
  { key: 'f', label: 'Forward focused card to GitHub' },
  { key: 'e', label: 'Open drawer on focused card' },
  { key: 'x / shift+x', label: 'Toggle / range-select focused card' },
  { key: '/', label: 'Focus search' },
  { key: '⌘K', label: 'Command palette' },
  { key: '?', label: 'This help overlay' },
  { key: 'esc', label: 'Clear selection / close drawer' },
];
