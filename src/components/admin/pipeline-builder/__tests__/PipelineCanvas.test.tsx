/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@xyflow/react', () => ({
  ReactFlow: (p: { children: React.ReactNode }) => <div data-testid="rf">{p.children}</div>,
  Background: () => null,
  MiniMap: () => null,
  ConnectionLineType: { SmoothStep: 'smoothstep' },
  useReactFlow: () => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn(), getViewport: () => ({ zoom: 1 }), getNodes: () => [] }),
}));
vi.mock('../panels/CanvasControls', () => ({ default: () => <div data-testid="controls" /> }));
vi.mock('../panels/CanvasEmptyState', () => ({ default: () => <div data-testid="empty" /> }));
vi.mock('../panels/MultiSelectActionBar', () => ({ default: () => <div data-testid="bulk" /> }));

import PipelineCanvas from '../PipelineCanvas';

const baseProps = {
  nodes: [], edges: [], validationNodeIds: new Set<string>(),
  hasNodeTypeList: true, pipelineName: 'p1', selectedCount: 0, nodeTypes: {},
  onNodesChange: vi.fn(), onEdgesChange: vi.fn(), onConnect: vi.fn(),
  onDrop: vi.fn(), onDragOver: vi.fn(),
  onNodeClick: vi.fn(), onEdgeClick: vi.fn(),
  onPaneClick: vi.fn(), onNodeContextMenu: vi.fn(),
  onDeselectAll: vi.fn(), onBulkDelete: vi.fn(),
  onBulkDuplicate: vi.fn(), onLayoutSelected: vi.fn(),
  onSaveAsTemplate: vi.fn(), onOpenCommandPalette: vi.fn(),
  onOpenTemplateLibrary: vi.fn(), onImport: vi.fn(), onImportError: vi.fn(),
};

function wrap(ui: React.ReactNode) { return <TooltipProvider>{ui}</TooltipProvider>; }

describe('PipelineCanvas', () => {
  it('renders ReactFlow + canvas controls', () => {
    render(wrap(<PipelineCanvas {...baseProps} />));
    expect(screen.getByTestId('rf')).toBeInTheDocument();
    expect(screen.getByTestId('controls')).toBeInTheDocument();
  });

  it('renders empty state when no nodes', () => {
    render(wrap(<PipelineCanvas {...baseProps} />));
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });

  it('shows bulk action bar when 2+ selected', () => {
    render(wrap(<PipelineCanvas {...baseProps} selectedCount={3} />));
    expect(screen.getByTestId('bulk')).toBeInTheDocument();
  });

  it('hides bulk bar when <2 selected', () => {
    render(wrap(<PipelineCanvas {...baseProps} selectedCount={1} />));
    expect(screen.queryByTestId('bulk')).toBeNull();
  });
});
