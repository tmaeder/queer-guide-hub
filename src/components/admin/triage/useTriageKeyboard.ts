import { useEffect, useCallback } from 'react';

interface UseTriageKeyboardOptions {
  items: { id: string }[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onSkip: () => void;
  onFlag: () => void;
  onToggleCheck: () => void;
  enabled: boolean;
}

export function useTriageKeyboard({
  items,
  activeId,
  onNavigate,
  onApprove,
  onReject,
  onSkip,
  onFlag,
  onToggleCheck,
  enabled,
}: UseTriageKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const idx = items.findIndex((i) => i.id === activeId);

      switch (e.key) {
        case 'j': {
          e.preventDefault();
          const next = idx < items.length - 1 ? items[idx + 1] : items[idx];
          if (next) onNavigate(next.id);
          break;
        }
        case 'k': {
          e.preventDefault();
          const prev = idx > 0 ? items[idx - 1] : items[idx];
          if (prev) onNavigate(prev.id);
          break;
        }
        case 'a': {
          e.preventDefault();
          onApprove();
          break;
        }
        case 'r': {
          e.preventDefault();
          onReject();
          break;
        }
        case 's': {
          e.preventDefault();
          onSkip();
          break;
        }
        case 'f': {
          e.preventDefault();
          onFlag();
          break;
        }
        case ' ': {
          e.preventDefault();
          onToggleCheck();
          break;
        }
      }
    },
    [items, activeId, onNavigate, onApprove, onReject, onSkip, onFlag, onToggleCheck, enabled],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
