import { useCallback, useEffect, useMemo, useState } from 'react';
import { kanbanColumns, type KanbanStatus } from '@/components/admin/feedback/constants';
import type { FeedbackSubmission } from '@/components/admin/feedback/types';

export function useFeedbackSelection(
  grouped: Record<KanbanStatus, FeedbackSubmission[]>,
  filteredItems: FeedbackSubmission[],
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedColumnIdx, setFocusedColumnIdx] = useState(0);

  const toggleSelect = useCallback(
    (id: string, shift: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shift && lastSelectedId) {
          const col = kanbanColumns[focusedColumnIdx];
          const colIds = grouped[col.id].map((i) => i.id);
          const aIdx = colIds.indexOf(lastSelectedId);
          const bIdx = colIds.indexOf(id);
          if (aIdx >= 0 && bIdx >= 0) {
            const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
            for (let i = lo; i <= hi; i++) next.add(colIds[i]);
            setLastSelectedId(id);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setLastSelectedId(id);
        return next;
      });
    },
    [grouped, focusedColumnIdx, lastSelectedId],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const selectAllVisible = useCallback(() => {
    const next = new Set<string>();
    for (const col of kanbanColumns) for (const it of grouped[col.id]) next.add(it.id);
    setSelectedIds(next);
  }, [grouped]);

  useEffect(() => {
    if (focusedId && !filteredItems.some((it) => it.id === focusedId)) {
      setFocusedId(null);
    }
  }, [filteredItems, focusedId]);

  const moveFocus = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      if (dir === 'left' || dir === 'right') {
        const nextIdx =
          dir === 'left'
            ? Math.max(0, focusedColumnIdx - 1)
            : Math.min(kanbanColumns.length - 1, focusedColumnIdx + 1);
        setFocusedColumnIdx(nextIdx);
        const col = kanbanColumns[nextIdx];
        const colItems = grouped[col.id];
        setFocusedId(colItems[0]?.id ?? null);
        return;
      }
      const col = kanbanColumns[focusedColumnIdx];
      const colItems = grouped[col.id];
      if (colItems.length === 0) return;
      const idx = focusedId ? colItems.findIndex((i) => i.id === focusedId) : -1;
      const nextIdx =
        dir === 'down'
          ? Math.min(colItems.length - 1, idx + 1)
          : idx < 0
            ? 0
            : Math.max(0, idx - 1);
      setFocusedId(colItems[nextIdx]?.id ?? null);
    },
    [focusedColumnIdx, focusedId, grouped],
  );

  const actionTargetIds = useMemo(() => {
    if (selectedIds.size > 0) return Array.from(selectedIds);
    if (focusedId) return [focusedId];
    return [];
  }, [selectedIds, focusedId]);

  return {
    selectedIds,
    focusedId,
    setFocusedId,
    focusedColumnIdx,
    setFocusedColumnIdx,
    toggleSelect,
    clearSelection,
    selectAllVisible,
    moveFocus,
    actionTargetIds,
  };
}
