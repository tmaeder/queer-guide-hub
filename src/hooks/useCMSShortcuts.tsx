import { useEffect } from 'react';

export interface CMSShortcutHandlers {
  /** Open command palette (⌘K / Ctrl+K). */
  onPalette?: () => void;
  /** Save current editor (⌘S / Ctrl+S). */
  onSave?: () => void;
  /** Publish/primary-action in editor (⌘Enter / Ctrl+Enter). */
  onPublish?: () => void;
  /** Move down in list (J). */
  onNext?: () => void;
  /** Move up in list (K). */
  onPrev?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (target.closest('[role="dialog"] input, [role="dialog"] textarea, .ProseMirror')) {
    return true;
  }
  return false;
}

export function useCMSShortcuts(handlers: CMSShortcutHandlers) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (meta && key === 'k') {
        e.preventDefault();
        handlers.onPalette?.();
        return;
      }
      if (meta && key === 's') {
        if (!handlers.onSave) return;
        e.preventDefault();
        handlers.onSave();
        return;
      }
      if (meta && (key === 'enter' || e.key === 'Enter')) {
        if (!handlers.onPublish) return;
        e.preventDefault();
        handlers.onPublish();
        return;
      }

      // J/K list navigation — only when NOT typing.
      if (!meta && !e.altKey && !e.shiftKey && (key === 'j' || key === 'k')) {
        if (isTypingTarget(e.target)) return;
        if (key === 'j' && handlers.onNext) {
          e.preventDefault();
          handlers.onNext();
        } else if (key === 'k' && handlers.onPrev) {
          e.preventDefault();
          handlers.onPrev();
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}
