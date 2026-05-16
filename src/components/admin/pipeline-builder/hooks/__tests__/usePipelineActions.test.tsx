/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { usePipelineActions } from '../usePipelineActions';

describe('usePipelineActions', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => {
      const wrapRef = useRef<HTMLDivElement>(null);
      const clipRef = useRef<Record<string, unknown> | null>(null);
      return usePipelineActions({
        nodes: [],
        edges: [],
        setNodes: vi.fn(),
        setEdges: vi.fn(),
        setIsDirty: vi.fn(),
        setSelectedNodeId: vi.fn(),
        selectedNodeId: null,
        pipelineName: 'x',
        setPipelineName: vi.fn(),
        addNode: vi.fn(),
        undoRedo: { commitNow: vi.fn(), markEdit: vi.fn(), undo: vi.fn(), redo: vi.fn(), reset: vi.fn(), canUndo: false, canRedo: false },
        reactFlowWrapperRef: wrapRef,
        nodeTypeList: [],
        isDirty: false,
        configClipboardRef: clipRef,
      });
    });
    expect(result.current).toBeDefined();
  });
});
