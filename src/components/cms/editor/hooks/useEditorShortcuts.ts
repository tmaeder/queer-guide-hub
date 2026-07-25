/**
 * useEditorShortcuts — real global editor shortcuts while the editor overlay
 * is mounted: ⌘/Ctrl+S saves (always preventDefault so the browser save
 * dialog never appears), ⌘/Ctrl+Enter publishes. In queue mode ⌘Enter is
 * owned by useEditorQueue (approve + advance) — pass enabled: false there.
 */

import { useEffect } from 'react';

interface UseEditorShortcutsArgs {
  /** Disable entirely (e.g. queue mode owns ⌘Enter). ⌘S stays active. */
  publishEnabled: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onPublish?: () => void;
}

export function useEditorShortcuts({
  publishEnabled,
  isDirty,
  isSaving,
  onSave,
  onPublish,
}: UseEditorShortcutsArgs) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 's' || e.key === 'S') {
        // Always swallow ⌘S while the editor is open — the browser save
        // dialog is never what the user wants here.
        e.preventDefault();
        if (isDirty && !isSaving) onSave();
        return;
      }
      if (e.key === 'Enter' && publishEnabled && onPublish) {
        e.preventDefault();
        if (!isSaving) onPublish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [publishEnabled, isDirty, isSaving, onSave, onPublish]);
}
