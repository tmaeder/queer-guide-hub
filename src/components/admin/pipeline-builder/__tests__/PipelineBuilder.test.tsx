/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

vi.mock('./hooks/usePipelineBuilder', () => ({
  usePipelineBuilder: () => ({
    nodes: [], edges: [], setNodes: vi.fn(), setEdges: vi.fn(),
    onNodesChange: vi.fn(), onEdgesChange: vi.fn(), onConnect: vi.fn(),
    addNode: vi.fn(), pipelineName: '', setPipelineName: vi.fn(),
    save: vi.fn(), isSaving: false, run: vi.fn(), isRunning: false,
    selectedNodeId: null, setSelectedNodeId: vi.fn(),
    loadPipeline: vi.fn(),
  }),
  usePipelineNodeTypes: () => ({ data: [] }),
  usePipelineDefinitions: () => ({ data: [] }),
}));
vi.mock('./hooks/usePipelineExecution', () => ({
  usePipelineExecution: () => ({ runStatus: null, clearOverlay: vi.fn() }),
}));
vi.mock('./hooks/usePipelineHistory', () => ({
  useLatestPipelineRun: () => ({ data: undefined }),
  usePipelineRun: () => ({ data: undefined }),
}));
vi.mock('./hooks/usePipelineActions', () => ({
  usePipelineActions: () => ({
    handleSave: vi.fn(), handleRun: vi.fn(), handleAutoLayout: vi.fn(),
    handleAddComment: vi.fn(), handleAddGroup: vi.fn(),
    handleTemplateApply: vi.fn(), applyAISuggestion: vi.fn(),
    handleImport: vi.fn(), loadVersionRevert: vi.fn(),
    toastChangesDiscarded: vi.fn(),
  }),
  usePipelineDerived: () => [[], [], [], { selectedNode: null }],
}));
vi.mock('./hooks/useUndoRedo', () => ({
  useUndoRedo: () => ({ undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false, reset: vi.fn() }),
}));
vi.mock('./hooks/useDraftAutosave', () => ({
  useDraftAutosave: () => ({ hasDraft: () => false, loadDraft: () => null, clearDraft: vi.fn() }),
}));
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => null, Controls: () => null, MiniMap: () => null,
  Panel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useReactFlow: () => ({ fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getNodes: () => [], getEdges: () => [] }),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  Handle: () => null,
  applyNodeChanges: (changes: unknown, nodes: unknown[]) => nodes,
  applyEdgeChanges: (changes: unknown, edges: unknown[]) => edges,
  addEdge: (e: unknown, edges: unknown[]) => edges,
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  MarkerType: { ArrowClosed: 'arrowclosed' },
  ConnectionLineType: { Bezier: 'bezier', Straight: 'straight', Step: 'step', SmoothStep: 'smoothstep', SimpleBezier: 'simplebezier' },
  ConnectionMode: { Strict: 'strict', Loose: 'loose' },
  PanOnScrollMode: { Free: 'free', Vertical: 'vertical', Horizontal: 'horizontal' },
  SelectionMode: { Partial: 'partial', Full: 'full' },
  BackgroundVariant: { Lines: 'lines', Dots: 'dots', Cross: 'cross' },
}));

import PipelineBuilder from '../PipelineBuilder';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('PipelineBuilder', () => {
  it('renders without crashing', () => {
    const { container } = render(<PipelineBuilder />, { wrapper });
    expect(container).toBeTruthy();
  });
});
