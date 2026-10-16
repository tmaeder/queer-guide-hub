/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const NODE_TYPES = [
  { slug: 'rss', display_name: 'RSS Source', category: 'source', color: '#0ff', icon: 'rss', description: 'fetch RSS' },
] as never;

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

vi.mock('../hooks/usePipelineBuilder', () => ({
  usePipelineBuilder: () => ({
    nodes: [], edges: [], setNodes: vi.fn(), setEdges: vi.fn(),
    onNodesChange: vi.fn(), onEdgesChange: vi.fn(), onConnect: vi.fn(),
    addNode: vi.fn(), pipelineName: '', setPipelineName: vi.fn(),
    save: vi.fn(), isSaving: false, run: vi.fn(), isRunning: false,
    selectedNodeId: null, setSelectedNodeId: vi.fn(),
    loadPipeline: vi.fn(),
  }),
  usePipelineNodeTypes: () => ({ data: NODE_TYPES }),
  usePipelineDefinitions: () => ({ data: [] }),
}));
vi.mock('../hooks/usePipelineExecution', () => ({
  usePipelineExecution: () => ({ runStatus: null, clearOverlay: vi.fn() }),
}));
vi.mock('../hooks/usePipelineHistory', () => ({
  useLatestPipelineRun: () => ({ data: undefined }),
  usePipelineRun: () => ({ data: undefined }),
}));
// Every `actions.*` the component reads. A missing key is silently `undefined` until
// something calls or spreads it, so keep this in step with PipelineBuilder's usage.
const ACTION_KEYS = [
  'copyNodeConfig', 'deleteEdge', 'deleteNode', 'duplicateNode',
  'handleAddComment', 'handleAddGroup', 'handleAutoLayout', 'handleBulkDelete',
  'handleBulkDuplicate', 'handleDeselectAll', 'handleDuplicate', 'handleImport',
  'handleLayoutSelection', 'handleQuickAdd', 'handleRun', 'handleSave',
  'handleTemplateApply', 'handleUpdateNode', 'loadVersionRevert', 'onDragOver',
  'onDragStart', 'onDrop', 'onNodeClick', 'pasteNodeConfig', 'toastChangesDiscarded',
  'applyAISuggestion', 'updateEdgeCondition',
] as const;

vi.mock('../hooks/usePipelineActions', () => ({
  usePipelineActions: () => Object.fromEntries(ACTION_KEYS.map((k) => [k, vi.fn()])),
  // Mirrors the real return SHAPE: an object, not a tuple. The previous tuple mock
  // never loaded (its path was wrong), so this drift was invisible.
  usePipelineDerived: () => ({
    selectedNode: null,
    selectedForTemplate: { nodes: [], edges: [] },
    nodeTypesByCategory: {},
    validationIssues: { count: 0, nodeIds: new Set<string>() },
  }),
}));
vi.mock('../hooks/useUndoRedo', () => ({
  useUndoRedo: () => ({ undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false, reset: vi.fn() }),
}));
vi.mock('../hooks/useDraftAutosave', () => ({
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

  // AdminShell's command palette binds the same ⌘K on window in the bubble phase
  // (AdminCommandPalette.tsx, AdminCommandPaletteHost). preventDefault does NOT stop
  // propagation, so both used to fire and the shell's dialog rendered over quick-add.
  it('⌘K owns quick-add and never reaches a window-level bubble listener', () => {
    const shellHandler = vi.fn();
    window.addEventListener('keydown', shellHandler);
    try {
      render(<PipelineBuilder />, { wrapper });

      // Positive control: an unbound key still reaches the bubble listener, so the
      // assertions below are about interception and not about a dead dispatch.
      fireEvent.keyDown(document.body, { key: 'a' });
      expect(shellHandler).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
      expect(screen.getByPlaceholderText(/Type to search nodes/i)).toBeInTheDocument();
      expect(shellHandler).toHaveBeenCalledTimes(1);

      // Toggling closed is the case the old `inInput` guard broke: quick-add's own
      // search input holds focus, so the second press used to escape to the shell.
      fireEvent.keyDown(document.body, { key: 'K', metaKey: true });
      expect(shellHandler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', shellHandler);
    }
  });
});
