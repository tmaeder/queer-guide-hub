import { useCallback, useRef, useState, useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Edge } from '@xyflow/react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import BaseNode from './nodes/BaseNode';
import CommentNode from './nodes/CommentNode';
import GroupNode from './nodes/GroupNode';
import NodeConfigPanel from './panels/NodeConfigPanel';
import RunHistorySidebar from './panels/RunHistorySidebar';
import EdgeConditionPopover from './panels/EdgeConditionPopover';
import QuickAddPalette from './panels/QuickAddPalette';
import NodeContextMenu from './panels/NodeContextMenu';
import RunStatsBar from './panels/RunStatsBar';
import FindNodePalette from './panels/FindNodePalette';
import OnboardingTour from './panels/OnboardingTour';
import LogStreamDrawer from './panels/LogStreamDrawer';

import PipelineNodePalette from './PipelineNodePalette';
import PipelineToolbar from './PipelineToolbar';
import PipelineCanvas from './PipelineCanvas';

import { useUndoRedo } from './hooks/useUndoRedo';
import { useDraftAutosave } from './hooks/useDraftAutosave';
import { usePipelineBuilder, usePipelineNodeTypes, usePipelineDefinitions, type PipelineNodeType } from './hooks/usePipelineBuilder';
import { usePipelineExecution } from './hooks/usePipelineExecution';
import { useLatestPipelineRun, usePipelineRun } from './hooks/usePipelineHistory';
import { usePipelineActions, usePipelineDerived } from './hooks/usePipelineActions';

const nodeTypes = { baseNode: BaseNode, commentNode: CommentNode, groupNode: GroupNode };

function PipelineBuilderInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: nodeTypeList } = usePipelineNodeTypes();
  const { data: pipelineList } = usePipelineDefinitions();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const initialPipelineParam = params.get('pipeline') ?? params.get('pipeline_id') ?? undefined;
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | undefined>(undefined);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [editingEdge, setEditingEdge] = useState<{ edge: Edge; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const configClipboardRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!pipelineList || selectedPipelineId) return;
    if (initialPipelineParam) {
      const match = pipelineList.find(p => p.id === initialPipelineParam || p.name === initialPipelineParam);
      if (match) { setSelectedPipelineId(match.id); return; }
    }
    const defaultDef = pipelineList.find(p => p.name === 'hotel-ingestion-pipeline')
                    ?? pipelineList.find(p => p.name === 'events-ingestion-bulletproof')
                    ?? pipelineList.find(p => p.is_enabled && !p.is_template)
                    ?? pipelineList[0];
    if (defaultDef) setSelectedPipelineId(defaultDef.id);
  }, [pipelineList, initialPipelineParam, selectedPipelineId]);

  const {
    nodes, edges, setNodes, setEdges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, pipelineName, setPipelineName,
    save, isSaving, run, isRunning,
    selectedNodeId, setSelectedNodeId,
    loadPipeline,
  } = usePipelineBuilder(selectedPipelineId);

  const undoRedo = useUndoRedo(nodes, edges, setNodes, setEdges);
  const draftAutosave = useDraftAutosave(selectedPipelineId, pipelineName, nodes, edges, isDirty);

  // Track dirty state on user-originated edits + record undo history
  const nodesChangeWithHistory = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    const isUserEdit = changes.some(c =>
      c.type === 'add' || c.type === 'remove' || c.type === 'replace' ||
      (c.type === 'position' && c.dragging === false)
    );
    if (isUserEdit) { undoRedo.markEdit(); setIsDirty(true); }
    return onNodesChange(changes);
  }, [onNodesChange, undoRedo]);

  const edgesChangeWithHistory = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    const isUserEdit = changes.some(c => c.type === 'add' || c.type === 'remove' || c.type === 'replace');
    if (isUserEdit) { undoRedo.markEdit(); setIsDirty(true); }
    return onEdgesChange(changes);
  }, [onEdgesChange, undoRedo]);

  const actions = usePipelineActions({
    nodes, edges, setNodes, setEdges, setIsDirty,
    setSelectedNodeId, selectedNodeId,
    pipelineName, setPipelineName, addNode, undoRedo,
    reactFlowWrapperRef: reactFlowWrapper, nodeTypeList, isDirty, configClipboardRef,
  });

  const handleSave = useCallback(() => {
    if (isSaving) return;
    const slug = (pipelineName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug || slug.length < 2) {
      toast.error('Invalid name: Pipeline name must be at least 2 characters');
      return;
    }
    const conflict = pipelineList?.find(p => p.name === slug && p.id !== selectedPipelineId);
    if (conflict) {
      const override = window.confirm(
        `A pipeline named "${slug}" already exists (${conflict.display_name || conflict.name}).\n\n` +
        `Saving here would create a second pipeline with the same slug, which may cause routing confusion.\n\n` +
        `Continue anyway?`
      );
      if (!override) return;
    }
    save(undefined, {
      onSuccess: () => {
        setIsDirty(false);
        setLastSavedAt(Date.now());
        draftAutosave.clearDraft();
        toast({ title: 'Pipeline saved', description: `${nodes.length} nodes, ${edges.length} edges` });
      },
      onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
    } as Record<string, unknown>);
  }, [isSaving, save, nodes.length, edges.length, draftAutosave, pipelineName, pipelineList, selectedPipelineId]);

  const handleRun = useCallback((opts?: { dryRun?: boolean }) => {
    if (!opts?.dryRun) {
      const hasCommitNode = nodes.some(n => {
        const slug = (n.data as { nodeTypeSlug?: string })?.nodeTypeSlug || '';
        return slug.includes('commit');
      });
      const def = pipelineList?.find(p => p.id === selectedPipelineId);
      const nameLooksProd = /\b(prod|production|hotels?|events?|marketplace|news|personalities|cities|countries|venues?)\b/i.test(
        `${def?.name || ''} ${pipelineName}`
      );
      if ((hasCommitNode || nameLooksProd) && def?.is_enabled) {
        const confirmed = window.confirm(
          `⚠ This pipeline writes to production tables (commit node detected).\n\n` +
          `Run "${def?.display_name || def?.name || pipelineName}" now?\n\n` +
          `Click Cancel to abort, or use Dry Run to test without committing.`
        );
        if (!confirmed) return;
      }
    }
    run(opts, {
      onSuccess: (data: Record<string, unknown>) => {
        if (data?.pipeline_run_id) {
          setActiveRunId(data.pipeline_run_id as string);
          setViewingRunId(null);
          setLogDrawerOpen(true);
        }
      },
    } as Record<string, unknown>);
  }, [run, nodes, pipelineList, selectedPipelineId, pipelineName]);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setEditingEdge({ edge, x: event.clientX, y: event.clientY });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 's') { e.preventDefault(); handleSave(); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); handleRun({ dryRun: e.shiftKey }); return; }
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoRedo.undo(); setIsDirty(true); return; }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); undoRedo.redo(); setIsDirty(true); return; }
      if (mod && e.key === 'd' && !inInput) { e.preventDefault(); actions.handleDuplicate(); return; }
      if (mod && e.key === 'l' && !inInput) { e.preventDefault(); actions.handleAutoLayout(); return; }
      if (e.key === 'Escape' && selectedNodeId) { setSelectedNodeId(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !inInput) {
        e.preventDefault();
        setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
        setEdges(eds => eds.filter(ed => ed.source !== selectedNodeId && ed.target !== selectedNodeId));
        setSelectedNodeId(null);
        setIsDirty(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleRun, actions, undoRedo, selectedNodeId, setNodes, setEdges, setSelectedNodeId]);

  // Unsaved changes warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Load pipeline + draft restore
  useEffect(() => {
    if (!selectedPipelineId || !pipelineList || !nodeTypeList) return;
    const def = pipelineList.find(p => p.id === selectedPipelineId);
    if (!def) return;
    loadPipeline(def, nodeTypeList);
    setIsDirty(false);
    undoRedo.reset();
    const draft = draftAutosave.loadDraft();
    if (draft?.pipelineId === selectedPipelineId && draft.nodes.length > 0) {
      const age = Math.round((Date.now() - draft.savedAt) / 1000);
      const ageStr = age < 60 ? `${age}s` : age < 3600 ? `${Math.round(age / 60)}m` : `${Math.round(age / 3600)}h`;
      if (window.confirm(`Unsaved draft found (${draft.nodes.length} nodes, saved ${ageStr} ago). Restore?`)) {
        setNodes(draft.nodes);
        setEdges(draft.edges);
        setPipelineName(draft.pipelineName);
        setIsDirty(true);
        toast.success('Draft restored');
      } else {
        draftAutosave.clearDraft();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPipelineId, pipelineList, nodeTypeList]);

  const { runStatus, clearOverlay } = usePipelineExecution(activeRunId, setNodes);
  const { data: latestRun } = useLatestPipelineRun(selectedPipelineId);
  const { data: viewedRun } = usePipelineRun(viewingRunId || undefined);

  // Overlay node_states from latest OR viewed-historical run
  useEffect(() => {
    if (activeRunId) return;
    const source = viewedRun || latestRun;
    if (!source) return;
    const states = source.node_states || {};
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const s = states[node.id];
        if (!s) {
          const d = node.data as Record<string, unknown>;
          if (d.status || d.itemsOut !== undefined) {
            changed = true;
            return { ...node, data: { ...node.data, status: undefined, itemsOut: undefined, itemsIn: undefined, durationMs: undefined, errorMessage: undefined } };
          }
          return node;
        }
        const d = node.data as Record<string, unknown>;
        if (d.status === s.status && d.itemsOut === s.items_out && d.itemsIn === s.items_in &&
            d.durationMs === s.duration_ms && d.errorMessage === s.error) return node;
        changed = true;
        return { ...node, data: {
          ...node.data,
          status: s.status, itemsOut: s.items_out, itemsIn: s.items_in,
          durationMs: s.duration_ms, errorMessage: s.error,
        } };
      });
      return changed ? next : current;
    });
  }, [latestRun, viewedRun, activeRunId, setNodes]);

  const { selectedNode, selectedForTemplate, nodeTypesByCategory, validationIssues } =
    usePipelineDerived(nodes, edges, nodeTypeList, paletteSearch, selectedNodeId);

  // Container height
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerHeight(window.innerHeight - containerRef.current.getBoundingClientRect().top);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const showSavedPulse = lastSavedAt && Date.now() - lastSavedAt < 3000;

  return (
    <TooltipProvider delayDuration={200}>
      <div ref={containerRef} className="flex overflow-hidden -mx-6 -mt-4" style={{ height: containerHeight }}>
        <PipelineNodePalette
          paletteSearch={paletteSearch}
          setPaletteSearch={setPaletteSearch}
          nodeTypesByCategory={nodeTypesByCategory}
          onDragStart={actions.onDragStart as unknown as (e: import('@xyflow/react').DragEvent<HTMLDivElement>, nt: PipelineNodeType) => void}
          onQuickAdd={actions.handleQuickAdd}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <PipelineToolbar
            selectedPipelineId={selectedPipelineId}
            setSelectedPipelineId={setSelectedPipelineId}
            pipelineList={pipelineList}
            isDirty={isDirty}
            setViewingRunId={setViewingRunId}
            setParams={setParams}
            setNodes={setNodes}
            setIsDirty={setIsDirty}
            setPipelineName={setPipelineName}
            pipelineName={pipelineName}
            isSaving={isSaving}
            isRunning={isRunning}
            showSavedPulse={showSavedPulse}
            handleSave={handleSave}
            handleRun={handleRun}
            loadPipeline={loadPipeline}
            nodeTypeList={nodeTypeList}
            toastChangesDiscarded={() => toast.success('Changes discarded')}
            resetUndo={undoRedo.reset}
            undo={undoRedo.undo}
            redo={undoRedo.redo}
            canUndo={undoRedo.canUndo}
            canRedo={undoRedo.canRedo}
            handleAutoLayout={actions.handleAutoLayout}
            handleAddComment={actions.handleAddComment}
            handleAddGroup={actions.handleAddGroup}
            nodes={nodes}
            edges={edges}
            selectedForTemplateNodes={selectedForTemplate.nodes}
            selectedForTemplateEdges={selectedForTemplate.edges}
            handleTemplateApply={actions.handleTemplateApply}
            applyAISuggestion={(suggestedNodes, suggestedEdges) => {
              if (isDirty && !window.confirm('Unsaved changes will be lost. Apply AI suggestion?')) return;
              undoRedo.commitNow();
              setNodes(suggestedNodes);
              setEdges(suggestedEdges);
              setIsDirty(true);
            }}
            handleImport={actions.handleImport}
            loadVersionRevert={(v) => {
              if (!nodeTypeList) return;
              undoRedo.commitNow();
              loadPipeline({
                id: v.pipeline_id, name: v.name, display_name: v.display_name,
                description: v.description, nodes: v.nodes, edges: v.edges,
                schedule: v.schedule, is_enabled: true, is_template: false, version: v.version,
              } as Parameters<typeof loadPipeline>[0], nodeTypeList);
              setIsDirty(true);
              toast({ title: `Reverted to v${v.version}`, description: 'Click Save to persist' });
            }}
            activeRunId={activeRunId}
            runStatus={runStatus}
            setActiveRunId={setActiveRunId}
            clearOverlay={clearOverlay}
            logDrawerOpen={logDrawerOpen}
            setLogDrawerOpen={setLogDrawerOpen as (fn: (o: boolean) => boolean) => void}
            viewingRunId={viewingRunId}
            latestRun={latestRun}
            validationCount={validationIssues.count}
            navigate={navigate}
          />

          {viewingRunId && <RunStatsBar runId={viewingRunId} onClose={() => setViewingRunId(null)} />}

          <PipelineCanvas
            ref={reactFlowWrapper}
            nodes={nodes}
            edges={edges}
            validationNodeIds={validationIssues.nodeIds}
            hasNodeTypeList={!!nodeTypeList}
            pipelineName={pipelineName}
            selectedCount={selectedForTemplate.nodes.length}
            nodeTypes={nodeTypes}
            onNodesChange={nodesChangeWithHistory}
            onEdgesChange={edgesChangeWithHistory}
            onConnect={(c) => { undoRedo.commitNow(); onConnect(c); setIsDirty(true); }}
            onDrop={actions.onDrop as React.DragEventHandler}
            onDragOver={actions.onDragOver as React.DragEventHandler}
            onNodeClick={actions.onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={() => { setSelectedNodeId(null); setEditingEdge(null); setContextMenu(null); }}
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
            }}
            onDeselectAll={actions.handleDeselectAll}
            onBulkDelete={actions.handleBulkDelete}
            onBulkDuplicate={actions.handleBulkDuplicate}
            onLayoutSelected={actions.handleLayoutSelection}
            onSaveAsTemplate={() => {
              const btn = document.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement | null;
              btn?.click();
            }}
            onOpenCommandPalette={() => setQuickAddOpen(true)}
            onOpenTemplateLibrary={() => {
              const btn = document.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement | null;
              btn?.click();
            }}
            onImport={actions.handleImport}
            onImportError={(msg) => toast.error(`Import failed: ${msg}`)}
          />
        </div>

        {selectedNode && nodeTypeList && (
          <NodeConfigPanel
            node={selectedNode}
            nodeTypes={nodeTypeList}
            onUpdate={actions.handleUpdateNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        {!selectedNode && selectedPipelineId && (
          <RunHistorySidebar
            pipelineId={selectedPipelineId}
            activeRunId={viewingRunId || activeRunId}
            onSelectRun={setViewingRunId}
          />
        )}

        {editingEdge && (
          <EdgeConditionPopover
            edge={editingEdge.edge}
            anchorX={editingEdge.x}
            anchorY={editingEdge.y}
            onClose={() => setEditingEdge(null)}
            onUpdate={actions.updateEdgeCondition}
            onDelete={actions.deleteEdge}
          />
        )}

        {contextMenu && (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            nodeId={contextMenu.nodeId}
            canPaste={!!configClipboardRef.current}
            onClose={() => setContextMenu(null)}
            onDuplicate={actions.duplicateNode}
            onDelete={actions.deleteNode}
            onConfigure={(id) => { setSelectedNodeId(id); setContextMenu(null); }}
            onCopyConfig={actions.copyNodeConfig}
            onPasteConfig={actions.pasteNodeConfig}
          />
        )}

        {nodeTypeList && <QuickAddPalette nodeTypes={nodeTypeList} onAdd={actions.handleQuickAdd} />}
        {nodes.length > 0 && <FindNodePalette nodes={nodes} onSelect={setSelectedNodeId} />}
        {quickAddOpen && nodeTypeList && (
          <QuickAddPaletteController onClose={() => setQuickAddOpen(false)} />
        )}

        <OnboardingTour />

        {logDrawerOpen && activeRunId && (
          <LogStreamDrawer pipelineRunId={activeRunId} onClose={() => setLogDrawerOpen(false)} />
        )}
      </div>
    </TooltipProvider>
  );
}

function QuickAddPaletteController({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const evt = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
    window.dispatchEvent(evt);
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function PipelineBuilder() {
  return <PipelineBuilderInner />;
}
