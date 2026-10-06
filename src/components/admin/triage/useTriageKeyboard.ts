/**
 * useTriageKeyboard — triage-specific keyboard bindings, a thin wrapper over
 * the generic useListKeyboard (J/K nav + an action-key map). a/r/s act on the
 * active item, Space toggles its checkbox, U undoes the last decision where
 * the queue allows it.
 *
 * `f` (flag) is GONE, and deliberately not reimplemented. `triage_action`
 * accepted the string in its allowed-action list and had no flag handler in
 * any of its 17 queue branches, so it fell through to that function's
 * unconditional success object: the key wrote nothing, anywhere, for its whole
 * life, and the inbox toasted success and advanced to the next row. There is
 * no column on any of the 17 backing tables for a flag to live in, so giving
 * it a handler is a feature rather than a fix. 99991791310870 makes the RPC
 * refuse it so it cannot come back silently.
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
  onToggleCheck: () => void;
  /** Optional: undo the last approve/reject (U key). */
  onUndo?: () => void;
  enabled: boolean;
}

export function useTriageKeyboard({
  items,
  activeId,
  onNavigate,
  onApprove,
  onReject,
  onSkip,
  onToggleCheck,
  onUndo,
  enabled,
}: UseTriageKeyboardOptions) {
  const actions = useMemo(
    () => ({
      a: onApprove,
      r: onReject,
      s: onSkip,
      ' ': onToggleCheck,
      ...(onUndo ? { u: onUndo } : {}),
    }),
    [onApprove, onReject, onSkip, onToggleCheck, onUndo],
  );

  useListKeyboard({ items, activeId, onNavigate, actions, enabled });
}
