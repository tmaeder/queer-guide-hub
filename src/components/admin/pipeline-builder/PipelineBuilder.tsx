import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type DragEvent,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Save, Play, PlayCircle, BarChart3, Upload, Plus, Clock, Loader2, Check, LayoutGrid, Undo2, Redo2, Search, AlertCircle } from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router';
import { useToast } from '@/hooks/use-toast';

import BaseNode from './nodes/BaseNode';
import NodeConfigPanel from './panels/NodeConfigPanel';
import RunHistorySidebar from './panels/RunHistorySidebar';
import ImportExportMenu, { type PipelineExport } from './panels/ImportExportMenu';
import TemplateLibrary from './panels/TemplateLibrary';
import KeyboardShortcuts from './panels/KeyboardShortcuts';
import EdgeConditionPopover from './panels/EdgeConditionPopover';
import { autoLayout } from './utils/autoLayout';
import { useUndoRedo } from './hooks/useUndoRedo';
import { usePipelineBuilder, usePipelineNodeTypes, usePipelineDefinitions, type PipelineNodeType } from './hooks/usePipelineBuilder';
import { usePipelineExecution } from './hooks/usePipelineExecution';
import { useLatestPipelineRun, usePipelineRun } from './hooks/usePipelineHistory';
import { useSearchParams } from 'react-router';

const nodeTypes = { baseNode: BaseNode };

const categoryLabels: Record<string, string> = {
  source: 'Sources',
  processor: 'Processors',
  validator: 'Validators',
  enricher: 'Enrichers',
  output: 'Outputs',
  control: 'Control',
};

const categoryOrder = ['source', 'processor', 'validator', 'enricher', 'output', 'control'];

function PipelineBuilderInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
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

  // Track dirty state only on user-originated structural edits
  const wrappedOnNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    const isUserEdit = changes.some(c =>
      c.type === 'add' || c.type === 'remove' || c.type === 'replace' ||
      (c.type === 'position' && c.dragging === false)
    );
    if (isUserEdit) setIsDirty(true);
    return onNodesChange(changes);
  }, [onNodesChange]);

  const wrappedOnEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    const isUserEdit = changes.some(c => c.type === 'add' || c.type === 'remove' || c.type === 'replace');
    if (isUserEdit) setIsDirty(true);
    return onEdgesChange(changes);
  }, [onEdgesChange]);

  // Undo/redo stack
  const undoRedo = useUndoRedo(nodes, edges, setNodes, setEdges);

  // Wrap change handlers to record history on each structural edit
  const nodesChangeWithHistory = useCallback((changes: Parameters<typeof wrappedOnNodesChange>[0]) => {
    const needsHistory = changes.some(c =>
      c.type === 'add' || c.type === 'remove' || c.type === 'replace' ||
      (c.type === 'position' && c.dragging === false)
    );
    if (needsHistory) undoRedo.markEdit();
    return wrappedOnNodesChange(changes);
  }, [wrappedOnNodesChange, undoRedo]);

  const edgesChangeWithHistory = useCallback((changes: Parameters<typeof wrappedOnEdgesChange>[0]) => {
    const needsHistory = changes.some(c => c.type === 'add' || c.type === 'remove' || c.type === 'replace');
    if (needsHistory) undoRedo.markEdit();
    return wrappedOnEdgesChange(changes);
  }, [wrappedOnEdgesChange, undoRedo]);

  // Auto-layout: topological level-based positioning
  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;
    undoRedo.commitNow();
    setNodes(autoLayout(nodes, edges));
    setIsDirty(true);
    toast({ title: 'Layout applied', description: `${nodes.length} nodes arranged` });
  }, [nodes, edges, setNodes, undoRedo, toast]);

  // Duplicate selected node
  const handleDuplicate = useCallback(() => {
    if (!selectedNodeId) return;
    const src = nodes.find(n => n.id === selectedNodeId);
    if (!src) return;
    undoRedo.commitNow();
    const newId = `${(src.data as { nodeTypeSlug?: string })?.nodeTypeSlug || 'node'}-${Date.now()}`;
    const clone: Node = {
      ...src,
      id: newId,
      position: { x: (src.position?.x || 0) + 40, y: (src.position?.y || 0) + 40 },
      selected: true,
      data: JSON.parse(JSON.stringify(src.data)),
    };
    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), clone]);
    setSelectedNodeId(newId);
    setIsDirty(true);
  }, [selectedNodeId, nodes, setNodes, setSelectedNodeId, undoRedo]);

  // Edge click → open condition editor
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setEditingEdge({ edge, x: event.clientX, y: event.clientY });
  }, []);

  const updateEdgeCondition = useCallback((edgeId: string, condition: string) => {
    undoRedo.commitNow();
    setEdges(eds => eds.map(e => e.id === edgeId ? {
      ...e,
      data: { ...(e.data || {}), condition: condition || undefined },
      label: condition ? condition.slice(0, 30) + (condition.length > 30 ? '…' : '') : undefined,
      labelStyle: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
      labelBgStyle: { fill: 'hsl(var(--background))' },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
    } : e));
    setIsDirty(true);
  }, [setEdges, undoRedo]);

  const deleteEdge = useCallback((edgeId: string) => {
    undoRedo.commitNow();
    setEdges(eds => eds.filter(e => e.id !== edgeId));
    setIsDirty(true);
  }, [setEdges, undoRedo]);

  const handleSave = useCallback(() => {
    if (isSaving) return;
    save(undefined, {
      onSuccess: () => {
        setIsDirty(false);
        setLastSavedAt(Date.now());
        toast({ title: 'Pipeline saved', description: `${nodes.length} nodes, ${edges.length} edges` });
      },
      onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
    } as Record<string, unknown>);
  }, [isSaving, save, toast, nodes.length, edges.length]);

  const handleRun = useCallback((opts?: { dryRun?: boolean }) => {
    run(opts, {
      onSuccess: (data: Record<string, unknown>) => {
        if (data?.pipeline_run_id) {
          setActiveRunId(data.pipeline_run_id as string);
          setViewingRunId(null);
        }
      },
    } as Record<string, unknown>);
  }, [run]);

  const handleImport = useCallback((data: PipelineExport) => {
    if (isDirty && !window.confirm('Unsaved changes will be lost. Continue with import?')) return;
    const imported: Node[] = data.nodes.map(n => {
      const nt = nodeTypeList?.find(t => t.slug === (n.data?.nodeTypeSlug || n.type));
      return {
        id: n.id,
        type: 'baseNode',
        position: n.position,
        data: {
          label: n.data?.label,
          config: n.data?.config || {},
          nodeTypeSlug: n.data?.nodeTypeSlug || n.type,
          icon: nt?.icon || 'Box',
          color: nt?.color || '#6b7280',
          category: nt?.category,
          description: nt?.description,
          inputPorts: nt?.input_ports || [],
          outputPorts: nt?.output_ports || [],
        },
      };
    });
    setNodes(imported);
    setEdges(data.edges.map(e => ({ ...e, animated: true })) as Edge[]);
    setPipelineName(data.display_name || data.name);
    setIsDirty(true);
  }, [isDirty, nodeTypeList, setNodes, setEdges, setPipelineName]);

  const handleTemplateApply = useCallback((template: { nodes: Node[]; edges: Edge[] }) => {
    // Offset template nodes to avoid overlap with existing canvas
    const offset = { x: 50, y: 50 };
    const idMap = new Map<string, string>();
    const now = Date.now();
    const newNodes: Node[] = template.nodes.map((n, i) => {
      const newId = `${(n.data as { nodeTypeSlug?: string })?.nodeTypeSlug || 'node'}-${now}-${i}`;
      idMap.set(n.id, newId);
      const nt = nodeTypeList?.find(t => t.slug === ((n.data as { nodeTypeSlug?: string })?.nodeTypeSlug));
      return {
        ...n,
        id: newId,
        type: 'baseNode',
        position: { x: (n.position?.x || 0) + offset.x, y: (n.position?.y || 0) + offset.y },
        data: {
          ...n.data,
          icon: nt?.icon || (n.data as { icon?: string })?.icon || 'Box',
          color: nt?.color || (n.data as { color?: string })?.color || '#6b7280',
          inputPorts: nt?.input_ports || [],
          outputPorts: nt?.output_ports || [],
        },
        selected: true,
      };
    });
    const newEdges: Edge[] = template.edges.map((e, i) => ({
      ...e,
      id: `${e.id}-${now}-${i}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
      animated: true,
    }));
    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes]);
    setEdges(eds => [...eds, ...newEdges]);
    setIsDirty(true);
  }, [nodeTypeList, setNodes, setEdges]);

  // Keyboard shortcuts: Cmd+S, Cmd+Enter, Shift+Cmd+Enter, Cmd+K, Delete/Backspace, Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        handleRun({ dryRun: e.shiftKey });
        return;
      }
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRedo.undo();
        setIsDirty(true);
        return;
      }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        undoRedo.redo();
        setIsDirty(true);
        return;
      }
      if (mod && e.key === 'd' && !inInput) {
        e.preventDefault();
        handleDuplicate();
        return;
      }
      if (mod && e.key === 'l' && !inInput) {
        e.preventDefault();
        handleAutoLayout();
        return;
      }
      if (e.key === 'Escape' && selectedNodeId) {
        setSelectedNodeId(null);
        return;
      }
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
  }, [handleSave, handleRun, handleDuplicate, handleAutoLayout, undoRedo, selectedNodeId, setNodes, setEdges, setSelectedNodeId]);

  // Unsaved changes warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    if (!selectedPipelineId || !pipelineList || !nodeTypeList) return;
    const def = pipelineList.find(p => p.id === selectedPipelineId);
    if (def) { loadPipeline(def, nodeTypeList); setIsDirty(false); undoRedo.reset(); }
  }, [selectedPipelineId, pipelineList, nodeTypeList, loadPipeline, undoRedo]);

  const { runStatus, clearOverlay } = usePipelineExecution(activeRunId, setNodes);

  const { data: latestRun } = useLatestPipelineRun(selectedPipelineId);
  const { data: viewedRun } = usePipelineRun(viewingRunId || undefined);

  // Overlay node_states from latest OR viewed-historical run
  useEffect(() => {
    if (activeRunId) return; // live execution takes priority
    const source = viewedRun || latestRun;
    if (!source) return;
    const states = source.node_states || {};
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const s = states[node.id];
        if (!s) {
          // Clear overlay when viewing a different run
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
          status: s.status,
          itemsOut: s.items_out,
          itemsIn: s.items_in,
          durationMs: s.duration_ms,
          errorMessage: s.error,
        } };
      });
      return changed ? next : current;
    });
  }, [latestRun, viewedRun, activeRunId, setNodes]);

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  // Track selected-for-template nodes/edges (multi-select)
  const selectedForTemplate = useMemo(() => {
    const selectedNodes = nodes.filter(n => n.selected);
    const selectedIds = new Set(selectedNodes.map(n => n.id));
    const selectedEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
    return { nodes: selectedNodes, edges: selectedEdges };
  }, [nodes, edges]);

  const handleUpdateNode = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data } : n));
    setIsDirty(true);
  }, [setNodes]);

  const nodeTypesByCategory = useMemo(() => {
    if (!nodeTypeList) return {};
    const q = paletteSearch.trim().toLowerCase();
    const grouped: Record<string, PipelineNodeType[]> = {};
    for (const nt of nodeTypeList) {
      if (q && !nt.display_name.toLowerCase().includes(q)
          && !nt.slug.toLowerCase().includes(q)
          && !(nt.description || '').toLowerCase().includes(q)) continue;
      if (!grouped[nt.category]) grouped[nt.category] = [];
      grouped[nt.category].push(nt);
    }
    return grouped;
  }, [nodeTypeList, paletteSearch]);

  // Validation: count nodes with missing required config
  const validationIssues = useMemo(() => {
    if (!nodeTypeList) return { count: 0, nodeIds: new Set<string>() };
    const nodeIds = new Set<string>();
    for (const n of nodes) {
      const d = n.data as { nodeTypeSlug?: string; config?: Record<string, unknown> };
      const nt = nodeTypeList.find(t => t.slug === d.nodeTypeSlug);
      const schema = nt?.config_schema as { required?: string[] } | undefined;
      const required = schema?.required || [];
      const config = d.config || {};
      const missing = required.some(k => config[k] === undefined || config[k] === null || config[k] === '');
      if (missing) nodeIds.add(n.id);
    }
    return { count: nodeIds.size, nodeIds };
  }, [nodes, nodeTypeList]);

  const onDragStart = useCallback((event: DragEvent<HTMLDivElement>, nodeType: PipelineNodeType) => {
    event.dataTransfer.setData('application/pipeline-node', JSON.stringify(nodeType));
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const data = event.dataTransfer.getData('application/pipeline-node');
      if (!data) return;
      const nodeType = JSON.parse(data) as PipelineNodeType;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      addNode(nodeType, { x: event.clientX - bounds.left - 90, y: event.clientY - bounds.top - 20 });
      setIsDirty(true);
    },
    [addNode]
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

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
        {/* Sidebar — Node Palette */}
        <div className="w-60 shrink-0 flex flex-col border-r border-border bg-muted/30 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="font-semibold text-[13px]">Node Palette</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Drag onto canvas</div>
            <div className="relative mt-2">
              <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                placeholder="Search nodes..."
                className="w-full h-7 pl-6 pr-2 text-[12px] border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {paletteSearch && (
                <button
                  onClick={() => setPaletteSearch('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[14px] leading-none p-1"
                  title="Clear search"
                >×</button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {paletteSearch && Object.values(nodeTypesByCategory).every(t => !t || t.length === 0) && (
              <div className="text-center text-[11px] text-muted-foreground py-6 px-2">
                No nodes match "{paletteSearch}"
              </div>
            )}
            <div className="flex flex-col gap-3">
              {categoryOrder.map(cat => {
                const types = nodeTypesByCategory[cat];
                if (!types?.length) return null;
                return (
                  <div key={cat}>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
                      {categoryLabels[cat] || cat}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {types.map(nt => {
                        const Icon = (Icons as Record<string, unknown>)[nt.icon] as React.ComponentType<{ className?: string }> || Icons.Box;
                        return (
                          <Tooltip key={nt.slug}>
                            <TooltipTrigger asChild>
                              <div
                                role="button"
                                tabIndex={0}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab text-[13px] hover:bg-accent transition-colors active:cursor-grabbing"
                                draggable
                                onDragStart={(e) => onDragStart(e as unknown as DragEvent<HTMLDivElement>, nt)}
                              >
                                <div
                                  className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                  style={{ backgroundColor: `${nt.color}20`, color: nt.color }}
                                >
                                  <Icon className="h-3 w-3" />
                                </div>
                                <span className="truncate">{nt.display_name}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs max-w-[200px]">
                              <div className="font-medium">{nt.display_name}</div>
                              {nt.description && <div className="text-muted-foreground mt-0.5">{nt.description}</div>}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0 z-10">
            <select
              value={selectedPipelineId ?? ''}
              onChange={(e) => {
                if (isDirty && !window.confirm('Unsaved changes will be lost. Continue?')) return;
                const id = e.target.value || undefined;
                setSelectedPipelineId(id);
                setViewingRunId(null);
                if (id) {
                  const def = pipelineList?.find(p => p.id === id);
                  if (def) setParams(prev => { const next = new URLSearchParams(prev); next.set('pipeline', def.name); return next; });
                } else {
                  setParams(prev => { const next = new URLSearchParams(prev); next.delete('pipeline'); return next; });
                }
              }}
              className="h-8 px-2 border border-border rounded-md text-xs min-w-[220px] bg-background"
            >
              <option value="">-- New pipeline --</option>
              {pipelineList?.map(p => (
                <option key={p.id} value={p.id}>
                  {p.is_enabled ? '' : '(off) '}{p.display_name || p.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => {
                if (isDirty && !window.confirm('Unsaved changes will be lost. Continue?')) return;
                setSelectedPipelineId(undefined);
                setNodes([]);
                setPipelineName('');
                setIsDirty(false);
                setParams(prev => { const next = new URLSearchParams(prev); next.delete('pipeline'); return next; });
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
            <Input
              value={pipelineName}
              onChange={(e) => { setPipelineName(e.target.value); setIsDirty(true); }}
              placeholder="Pipeline name..."
              className="w-56 h-8 text-sm"
            />
            <Separator orientation="vertical" className="h-6" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={isDirty ? 'default' : 'outline'}
                  onClick={handleSave}
                  disabled={isSaving}
                  className={showSavedPulse ? 'bg-green-50 text-green-700 border-green-200' : ''}
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> :
                   showSavedPulse ? <Check className="h-3.5 w-3.5 mr-1.5" /> :
                   <Save className="h-3.5 w-3.5 mr-1.5" />}
                  {isSaving ? 'Saving...' : showSavedPulse ? 'Saved' : 'Save'}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {isDirty ? 'Unsaved changes' : 'All saved'}
                <span className="ml-1 text-muted-foreground">{navigator.platform.includes('Mac') ? '⌘S' : 'Ctrl+S'}</span>
              </TooltipContent>
            </Tooltip>
            <Button size="sm" variant="outline" onClick={() => handleRun({ dryRun: true })} disabled={isRunning}>
              <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
              Dry Run
            </Button>
            <Button size="sm" onClick={() => handleRun()} disabled={isRunning}>
              {isRunning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
              {isRunning ? 'Starting...' : 'Run'}
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={undoRedo.undo} disabled={!undoRedo.canUndo}>
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Undo <span className="ml-1 text-muted-foreground">{navigator.platform.includes('Mac') ? '⌘Z' : 'Ctrl+Z'}</span></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={undoRedo.redo} disabled={!undoRedo.canRedo}>
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Redo <span className="ml-1 text-muted-foreground">{navigator.platform.includes('Mac') ? '⌘⇧Z' : 'Ctrl+Y'}</span></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleAutoLayout} disabled={nodes.length === 0}>
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Auto-layout <span className="ml-1 text-muted-foreground">{navigator.platform.includes('Mac') ? '⌘L' : 'Ctrl+L'}</span></TooltipContent>
            </Tooltip>
            <TemplateLibrary
              selectedNodes={selectedForTemplate.nodes}
              selectedEdges={selectedForTemplate.edges}
              onApply={handleTemplateApply}
            />
            <ImportExportMenu
              nodes={nodes}
              edges={edges}
              pipelineName={pipelineName}
              onImport={handleImport}
            />

            {activeRunId && runStatus && (
              <Badge variant="outline" className={`text-xs ${runStatus === 'running' ? 'bg-blue-100 text-blue-700 animate-pulse' : runStatus === 'completed' ? 'bg-green-100 text-green-700' : runStatus === 'failed' ? 'bg-red-100 text-red-700' : ''}`}>
                {runStatus}
              </Badge>
            )}
            {activeRunId && runStatus && ['completed', 'failed', 'cancelled'].includes(runStatus) && (
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setActiveRunId(null); clearOverlay(); }}>
                Clear
              </Button>
            )}

            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              {viewingRunId && (
                <Badge variant="outline" className="text-xs gap-1 bg-blue-50 text-blue-700 border-blue-200">
                  <Clock className="h-3 w-3" />
                  viewing historical
                  <button className="ml-1 hover:underline" onClick={() => setViewingRunId(null)}>×</button>
                </Badge>
              )}
              {!viewingRunId && latestRun && !activeRunId && (
                <Badge
                  variant="outline"
                  className={`text-xs gap-1 ${
                    latestRun.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                    latestRun.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                    latestRun.status === 'running' ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
                    'bg-muted text-muted-foreground'
                  }`}
                  title={`Run ${latestRun.id.slice(0, 8)} • ${latestRun.items_succeeded ?? 0}/${latestRun.items_total ?? 0} succeeded${latestRun.error_message ? ` • ${latestRun.error_message}` : ''}`}
                >
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(latestRun.started_at || latestRun.created_at), { addSuffix: true })} • {latestRun.status}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">{nodes.length} nodes</Badge>
              <Badge variant="outline" className="text-xs">{edges.length} edges</Badge>
              {validationIssues.count > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs gap-1 bg-amber-50 text-amber-700 border-amber-200 cursor-help">
                      <AlertCircle className="h-3 w-3" />
                      {validationIssues.count} incomplete
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs max-w-[240px]">
                    {validationIssues.count} node{validationIssues.count === 1 ? '' : 's'} with missing required config. Click a node to see its config panel.
                  </TooltipContent>
                </Tooltip>
              )}
              {isDirty && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">unsaved</Badge>}
              {(() => {
                const def = pipelineList?.find(p => p.id === selectedPipelineId);
                if (!def || !latestRun?.pipeline_version) return null;
                if (latestRun.pipeline_version === def.version) return null;
                return (
                  <Badge variant="outline" className="text-xs gap-1 bg-amber-50 text-amber-700 border-amber-200">
                    v{latestRun.pipeline_version}→v{def.version}
                  </Badge>
                );
              })()}
              <Separator orientation="vertical" className="h-4 mx-1" />
              <KeyboardShortcuts />
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate('/admin/pipelines?tab=monitor')}>
                <BarChart3 className="h-3 w-3 mr-1" /> Monitor
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate('/admin/imports')}>
                <Upload className="h-3 w-3 mr-1" /> Imports
              </Button>
            </div>
          </div>

          {/* React Flow Canvas */}
          <div ref={reactFlowWrapper} className="flex-1 min-h-0">
            <ReactFlow
              nodes={nodes.map(n => validationIssues.nodeIds.has(n.id) ? {
                ...n,
                data: { ...n.data, hasValidationIssue: true },
              } : n)}
              edges={edges}
              onNodesChange={nodesChangeWithHistory}
              onEdgesChange={edgesChangeWithHistory}
              onConnect={(c) => { undoRedo.commitNow(); onConnect(c); setIsDirty(true); }}
              onDrop={onDrop as React.DragEventHandler}
              onDragOver={onDragOver as React.DragEventHandler}
              onNodeClick={onNodeClick as (event: React.MouseEvent, node: unknown) => void}
              onEdgeClick={onEdgeClick as (event: React.MouseEvent, edge: unknown) => void}
              onPaneClick={() => { setSelectedNodeId(null); setEditingEdge(null); }}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={null}
              multiSelectionKeyCode="Shift"
              defaultEdgeOptions={{ animated: true, style: { strokeWidth: 2 } }}
              className="bg-muted/10"
            >
              <Background gap={16} size={1} />
              <Controls />
              <MiniMap
                nodeStrokeWidth={2}
                nodeColor={(node) => (node.data as Record<string, string>)?.color || '#6b7280'}
                className="!bg-background !border"
              />
            </ReactFlow>
          </div>
        </div>

        {/* Right Panel — Node Config */}
        {selectedNode && nodeTypeList && (
          <NodeConfigPanel
            node={selectedNode}
            nodeTypes={nodeTypeList}
            onUpdate={handleUpdateNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        {/* Run History Sidebar — only when no config panel is open */}
        {!selectedNode && selectedPipelineId && (
          <RunHistorySidebar
            pipelineId={selectedPipelineId}
            activeRunId={viewingRunId || activeRunId}
            onSelectRun={setViewingRunId}
          />
        )}

        {/* Edge condition editor popover */}
        {editingEdge && (
          <EdgeConditionPopover
            edge={editingEdge.edge}
            anchorX={editingEdge.x}
            anchorY={editingEdge.y}
            onClose={() => setEditingEdge(null)}
            onUpdate={updateEdgeCondition}
            onDelete={deleteEdge}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export default function PipelineBuilder() {
  return <PipelineBuilderInner />;
}
