import { forwardRef } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  ConnectionLineType,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CanvasControls from './panels/CanvasControls';
import CanvasEmptyState from './panels/CanvasEmptyState';
import MultiSelectActionBar from './panels/MultiSelectActionBar';
import type { PipelineExport } from './panels/ImportExportMenu';
import { isBaseNode, type AppNode, type AppEdge } from './types';

interface Props {
  nodes: AppNode[];
  edges: AppEdge[];
  validationNodeIds: Set<string>;
  hasNodeTypeList: boolean;
  pipelineName: string;
  selectedCount: number;
  nodeTypes: NodeTypes;
  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void;
  onConnect: (c: Connection) => void;
  onDrop: React.DragEventHandler;
  onDragOver: React.DragEventHandler;
  onNodeClick: (event: React.MouseEvent, node: AppNode) => void;
  onEdgeClick: (event: React.MouseEvent, edge: AppEdge) => void;
  onPaneClick: () => void;
  onNodeContextMenu: (event: React.MouseEvent, node: AppNode) => void;
  onDeselectAll: () => void;
  onBulkDelete: () => void;
  onBulkDuplicate: () => void;
  onLayoutSelected: () => void;
  onSaveAsTemplate: () => void;
  onOpenCommandPalette: () => void;
  onOpenTemplateLibrary: () => void;
  onImport: (data: PipelineExport) => void;
  onImportError: (msg: string) => void;
}

const PipelineCanvas = forwardRef<HTMLDivElement, Props>(function PipelineCanvas(props, ref) {
  const {
    nodes, edges, validationNodeIds, hasNodeTypeList, pipelineName, selectedCount,
    nodeTypes,
    onNodesChange, onEdgesChange, onConnect,
    onDrop, onDragOver, onNodeClick, onEdgeClick, onPaneClick, onNodeContextMenu,
    onDeselectAll, onBulkDelete, onBulkDuplicate, onLayoutSelected, onSaveAsTemplate,
    onOpenCommandPalette, onOpenTemplateLibrary, onImport, onImportError,
  } = props;

  return (
    <div ref={ref} className="flex-1 min-h-0 relative">
      <ReactFlow<AppNode, AppEdge>
        nodes={nodes.map(n => validationNodeIds.has(n.id) && isBaseNode(n) ? {
          ...n,
          data: { ...n.data, hasValidationIssue: true },
        } : n)}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        defaultEdgeOptions={{
          animated: true,
          type: 'smoothstep',
          style: { strokeWidth: 2 },
          pathOptions: { borderRadius: 16, offset: 20 },
        }}
        connectionLineType={ConnectionLineType.SmoothStep}
        className="bg-muted/10"
      >
        <Background gap={16} size={1} />
        <MiniMap<AppNode>
          nodeStrokeWidth={2}
          nodeColor={(node) => node.data.color || 'hsl(var(--muted-foreground))'}
          className="!bg-background !border"
          position="bottom-left"
        />
      </ReactFlow>

      <CanvasControls
        pipelineName={pipelineName}
        hasSelection={selectedCount > 0}
      />

      {selectedCount >= 2 && (
        <MultiSelectActionBar
          count={selectedCount}
          onDeselect={onDeselectAll}
          onDelete={onBulkDelete}
          onDuplicate={onBulkDuplicate}
          onLayoutSelected={onLayoutSelected}
          onSaveAsTemplate={onSaveAsTemplate}
        />
      )}

      {nodes.length === 0 && hasNodeTypeList && (
        <CanvasEmptyState
          onOpenCommandPalette={onOpenCommandPalette}
          onOpenTemplateLibrary={onOpenTemplateLibrary}
          onImport={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              try {
                const parsed = JSON.parse(await file.text()) as PipelineExport;
                onImport(parsed);
              } catch (err) {
                onImportError((err as Error).message);
              }
            };
            input.click();
          }}
        />
      )}
    </div>
  );
});

export default PipelineCanvas;
