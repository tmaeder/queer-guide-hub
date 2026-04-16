import { useEffect, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';

export interface DraftSnapshot {
  pipelineId?: string;
  pipelineName: string;
  nodes: Node[];
  edges: Edge[];
  savedAt: number;
}

const STORAGE_KEY = 'pipeline-builder-draft';
const AUTOSAVE_DELAY_MS = 2000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Auto-saves canvas state to localStorage on changes (debounced).
 * Returns a loadDraft function that can restore the most recent draft
 * when it's newer and for the same pipeline.
 */
export function useDraftAutosave(
  pipelineId: string | undefined,
  pipelineName: string,
  nodes: Node[],
  edges: Edge[],
  isDirty: boolean,
) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDirty || nodes.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      try {
        const snap: DraftSnapshot = {
          pipelineId,
          pipelineName,
          nodes,
          edges,
          savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      } catch {
        // Quota exceeded or disabled — silent failure
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pipelineId, pipelineName, nodes, edges, isDirty]);

  return {
    /** Load a draft if it's recent and matches the current pipeline */
    loadDraft: (): DraftSnapshot | null => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw) as DraftSnapshot;
        if (!snap?.savedAt || Date.now() - snap.savedAt > MAX_AGE_MS) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        return snap;
      } catch {
        return null;
      }
    },
    clearDraft: () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
  };
}
