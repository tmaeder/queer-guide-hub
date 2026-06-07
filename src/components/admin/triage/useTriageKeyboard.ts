/**
 * useTriageKeyboard — triage-specific keyboard bindings, now a thin wrapper over
 * the generic useListKeyboard (J/K nav + an action-key map). Behavior is
 * unchanged: a/r/s/f act on the active item, Space toggles its checkbox.
 */
import { useMemo } from 'react';
import { useListKeyboard } from '@/hooks/useListKeyboard';

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
  const actions = useMemo(
    () => ({
      a: onApprove,
      r: onReject,
      s: onSkip,
      f: onFlag,
      ' ': onToggleCheck,
    }),
    [onApprove, onReject, onSkip, onFlag, onToggleCheck],
  );

  useListKeyboard({ items, activeId, onNavigate, actions, enabled });
}
