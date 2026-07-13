import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { autoLayout, NODE_WIDTH, NODE_HEIGHT } from '../utils/autoLayout';
import type { PipelineExport } from '../panels/ImportExportMenu';
import type { PipelineNodeType } from './usePipelineBuilder';
import { isBaseNode, type AppNode, type AppEdge, type CommentNodeType, type GroupNodeType, type CommentNodeData, type GroupNodeData } from '../types';

interface Args {
  nodes: AppNode[];
  edges: AppEdge[];
  setNodes: (updater: AppNode[] | ((nds: AppNode[]) => AppNode[])) => void;
  setEdges: (updater: AppEdge[] | ((eds: AppEdge[]) => AppEdge[])) => void;
  setIsDirty: (v: boolean) => void;
  setSelectedNodeId: (id: string | null) => void;
  selectedNodeId: string | null;
  pipelineName: string;
  setPipelineName: (n: string) => void;
  addNode: (nt: PipelineNodeType, pos: { x: number; y: number }) => void;
  undoRedo: {
    commitNow: () => void;
    markEdit: () => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
    canUndo: boolean;
    canRedo: boolean;
  };
  reactFlowWrapperRef: React.RefObject<HTMLDivElement>;
  nodeTypeList: PipelineNodeType[] | undefined;
  isDirty: boolean;
  configClipboardRef: React.MutableRefObject<Record<string, unknown> | null>;
}

const slugOf = (n: AppNode) => (isBaseNode(n) ? n.data.nodeTypeSlug : undefined) || 'node';

export function usePipelineActions(a: Args) {
  const {
    nodes, edges, setNodes, setEdges, setIsDirty,
    setSelectedNodeId, selectedNodeId,
    setPipelineName, addNode, undoRedo,
    reactFlowWrapperRef, nodeTypeList, isDirty, configClipboardRef,
  } = a;

  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;
    undoRedo.commitNow();
    setNodes(autoLayout(nodes, edges));
    setIsDirty(true);
    toast.success('Layout applied', { description: `${nodes.length} nodes arranged` });
  }, [nodes, edges, setNodes, setIsDirty, undoRedo]);

  const duplicateNode = useCallback((nodeId: string) => {
    const src = nodes.find(n => n.id === nodeId);
    if (!src) return;
    undoRedo.commitNow();
    const newId = `${slugOf(src)}-${Date.now()}`;
    const clone: AppNode = {
      ...src,
      id: newId,
      position: { x: (src.position?.x || 0) + 40, y: (src.position?.y || 0) + 40 },
      selected: true,
      data: JSON.parse(JSON.stringify(src.data)),
    };
    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), clone]);
    setSelectedNodeId(newId);
    setIsDirty(true);
  }, [nodes, setNodes, setSelectedNodeId, setIsDirty, undoRedo]);

  const handleDuplicate = useCallback(() => {
    if (selectedNodeId) duplicateNode(selectedNodeId);
  }, [selectedNodeId, duplicateNode]);

  const deleteNode = useCallback((nodeId: string) => {
    undoRedo.commitNow();
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setIsDirty(true);
  }, [setNodes, setEdges, selectedNodeId, setSelectedNodeId, setIsDirty, undoRedo]);

  const copyNodeConfig = useCallback((nodeId: string) => {
    const n = nodes.find(x => x.id === nodeId);
    const cfg = n && isBaseNode(n) ? n.data.config : undefined;
    if (cfg && Object.keys(cfg).length > 0) {
      configClipboardRef.current = JSON.parse(JSON.stringify(cfg));
      toast.success('Config copied', { description: `${Object.keys(cfg).length} fields` });
    } else {
      toast.error('No config to copy');
    }
  }, [nodes, configClipboardRef]);

  const pasteNodeConfig = useCallback((nodeId: string) => {
    const cfg = configClipboardRef.current;
    if (!cfg) return;
    undoRedo.commitNow();
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId || !isBaseNode(n)) return n;
      return { ...n, data: { ...n.data, config: { ...(n.data.config || {}), ...cfg } } };
    }));
    setIsDirty(true);
    toast.success('Config pasted');
  }, [setNodes, setIsDirty, undoRedo, configClipboardRef]);

  const handleQuickAdd = useCallback((nt: PipelineNodeType) => {
    const bounds = reactFlowWrapperRef.current?.getBoundingClientRect();
    const center = bounds
      ? { x: bounds.width / 2 - 90, y: bounds.height / 2 - 20 }
      : { x: 200, y: 200 };
    undoRedo.commitNow();
    addNode(nt, center);
    setIsDirty(true);
  }, [addNode, undoRedo, setIsDirty, reactFlowWrapperRef]);

  const handleAddComment = useCallback(() => {
    const bounds = reactFlowWrapperRef.current?.getBoundingClientRect();
    const position = bounds
      ? { x: bounds.width / 2 - 100, y: bounds.height / 2 - 50 }
      : { x: 300, y: 200 };
    undoRedo.commitNow();
    const id = `comment-${Date.now()}`;
    const commentNode: CommentNodeType = {
      id,
      type: 'commentNode',
      position,
      data: { text: '', color: 'yellow' },
      width: 220,
      height: 120,
    };
    setNodes(nds => [...nds, commentNode]);
    setIsDirty(true);
    setSelectedNodeId(id);
  }, [setNodes, setSelectedNodeId, setIsDirty, undoRedo, reactFlowWrapperRef]);

  const handleAddGroup = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length < 1) {
      toast.success('Select nodes first: Shift-click to multi-select, then add group');
      return;
    }
    const PADDING = 40;
    const xs = selected.map(n => n.position?.x || 0);
    const ys = selected.map(n => n.position?.y || 0);
    const maxXs = selected.map(n => (n.position?.x || 0) + (n.width || NODE_WIDTH));
    const maxYs = selected.map(n => (n.position?.y || 0) + (n.height || NODE_HEIGHT));
    const minX = Math.min(...xs) - PADDING;
    const minY = Math.min(...ys) - PADDING * 1.5;
    const maxX = Math.max(...maxXs) + PADDING;
    const maxY = Math.max(...maxYs) + PADDING;

    undoRedo.commitNow();
    const id = `group-${Date.now()}`;
    const groupNode: GroupNodeType = {
      id,
      type: 'groupNode',
      position: { x: minX, y: minY },
      data: { label: 'Group', color: 'indigo' },
      width: maxX - minX,
      height: maxY - minY,
      selectable: true,
      draggable: true,
      zIndex: -1,
    };
    setNodes(nds => [groupNode, ...nds.map(n => ({ ...n, selected: false }))]);
    setIsDirty(true);
  }, [nodes, setNodes, setIsDirty, undoRedo]);

  // Comment/group inline edit listener
  useEffect(() => {
    const onCommentUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string; updates: Partial<CommentNodeData & GroupNodeData> };
      setNodes(nds => nds.map(n => n.id === detail.nodeId
        ? { ...n, data: { ...n.data, ...detail.updates } } as AppNode
        : n
      ));
      setIsDirty(true);
    };
    window.addEventListener('pipeline-comment-update', onCommentUpdate);
    window.addEventListener('pipeline-group-update', onCommentUpdate);
    return () => {
      window.removeEventListener('pipeline-comment-update', onCommentUpdate);
      window.removeEventListener('pipeline-group-update', onCommentUpdate);
    };
  }, [setNodes, setIsDirty]);

  const handleBulkDelete = useCallback(() => {
    const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
    if (selectedIds.size === 0) return;
    if (selectedIds.size > 3 && !window.confirm(`Delete ${selectedIds.size} nodes and their edges?`)) return;
    undoRedo.commitNow();
    setNodes(nds => nds.filter(n => !selectedIds.has(n.id)));
    setEdges(eds => eds.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
    setSelectedNodeId(null);
    setIsDirty(true);
    toast.success(`Deleted ${selectedIds.size} nodes`);
  }, [nodes, setNodes, setEdges, setSelectedNodeId, setIsDirty, undoRedo]);

  const handleBulkDuplicate = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length === 0) return;
    undoRedo.commitNow();
    const idMap = new Map<string, string>();
    const now = Date.now();
    const clones: AppNode[] = selected.map((src, i) => {
      const newId = `${slugOf(src)}-${now}-${i}`;
      idMap.set(src.id, newId);
      return {
        ...src,
        id: newId,
        position: { x: (src.position?.x || 0) + 40, y: (src.position?.y || 0) + 40 },
        selected: true,
        data: JSON.parse(JSON.stringify(src.data)),
      };
    });
    const selectedIds = new Set(selected.map(n => n.id));
    const cloneEdges: AppEdge[] = edges
      .filter(e => selectedIds.has(e.source) && selectedIds.has(e.target))
      .map((e, i) => ({
        ...e,
        id: `${e.id}-dup-${now}-${i}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        animated: true,
      }));
    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...clones]);
    setEdges(eds => [...eds, ...cloneEdges]);
    setIsDirty(true);
    toast.success(`Duplicated ${selected.length} nodes`);
  }, [nodes, edges, setNodes, setEdges, setIsDirty, undoRedo]);

  const handleLayoutSelection = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length === 0) return;
    const selectedIds = new Set(selected.map(n => n.id));
    const subEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
    undoRedo.commitNow();
    const laidOut = autoLayout(selected, subEdges);
    const origMinX = Math.min(...selected.map(n => n.position?.x || 0));
    const origMinY = Math.min(...selected.map(n => n.position?.y || 0));
    const newMinX = Math.min(...laidOut.map(n => n.position.x));
    const newMinY = Math.min(...laidOut.map(n => n.position.y));
    const dx = origMinX - newMinX;
    const dy = origMinY - newMinY;
    const posMap = new Map(laidOut.map(n => [n.id, { x: n.position.x + dx, y: n.position.y + dy }]));
    setNodes(nds => nds.map(n => posMap.has(n.id) ? { ...n, position: posMap.get(n.id)! } : n));
    setIsDirty(true);
    toast.success('Selection arranged', { description: `${selected.length} nodes` });
  }, [nodes, edges, setNodes, setIsDirty, undoRedo]);

  const handleDeselectAll = useCallback(() => {
    setNodes(nds => nds.map(n => n.selected ? { ...n, selected: false } : n));
    setSelectedNodeId(null);
  }, [setNodes, setSelectedNodeId]);

  const updateEdgeCondition = useCallback((edgeId: string, condition: string) => {
    undoRedo.commitNow();
    setEdges(eds => eds.map(e => e.id === edgeId ? {
      ...e,
      data: { ...(e.data || {}), condition: condition || undefined },
      label: condition ? condition.slice(0, 30) + (condition.length > 30 ? '…' : '') : undefined,
      labelStyle: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
      labelBgStyle: { fill: 'hsl(var(--background))' },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
    } : e));
    setIsDirty(true);
  }, [setEdges, setIsDirty, undoRedo]);

  const deleteEdge = useCallback((edgeId: string) => {
    undoRedo.commitNow();
    setEdges(eds => eds.filter(e => e.id !== edgeId));
    setIsDirty(true);
  }, [setEdges, setIsDirty, undoRedo]);

  const handleImport = useCallback((data: PipelineExport) => {
    if (isDirty && !window.confirm('Unsaved changes will be lost. Continue with import?')) return;
    const imported: AppNode[] = data.nodes.map(n => {
      const nt = nodeTypeList?.find(t => t.slug === (n.data?.nodeTypeSlug || n.type));
      return {
        id: n.id,
        type: 'baseNode' as const,
        position: n.position,
        data: {
          label: n.data?.label,
          config: n.data?.config || {},
          nodeTypeSlug: n.data?.nodeTypeSlug || n.type,
          icon: nt?.icon || 'Box',
          color: nt?.color || 'hsl(var(--muted-foreground))',
          category: nt?.category,
          description: nt?.description,
          inputPorts: nt?.input_ports || [],
          outputPorts: nt?.output_ports || [],
        },
      };
    });
    setNodes(imported);
    setEdges(data.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      data: e.condition ? { condition: e.condition } : undefined,
      animated: true,
    })));
    setPipelineName(data.display_name || data.name);
    setIsDirty(true);
  }, [isDirty, nodeTypeList, setNodes, setEdges, setPipelineName, setIsDirty]);

  const handleTemplateApply = useCallback((template: { nodes: AppNode[]; edges: AppEdge[] }) => {
    const offset = { x: 50, y: 50 };
    const idMap = new Map<string, string>();
    const now = Date.now();
    const newNodes: AppNode[] = template.nodes.map((n, i) => {
      const newId = `${slugOf(n)}-${now}-${i}`;
      idMap.set(n.id, newId);
      const nt = nodeTypeList?.find(t => t.slug === (isBaseNode(n) ? n.data.nodeTypeSlug : undefined));
      const d = n.data as Record<string, unknown>;
      return {
        ...n,
        id: newId,
        type: 'baseNode' as const,
        position: { x: (n.position?.x || 0) + offset.x, y: (n.position?.y || 0) + offset.y },
        data: {
          ...d,
          icon: nt?.icon || (d.icon as string) || 'Box',
          color: nt?.color || (d.color as string) || 'hsl(var(--muted-foreground))',
          inputPorts: nt?.input_ports || [],
          outputPorts: nt?.output_ports || [],
        },
        selected: true,
      };
    });
    const newEdges: AppEdge[] = template.edges.map((e, i) => ({
      ...e,
      id: `${e.id}-${now}-${i}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
      animated: true,
    }));
    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes]);
    setEdges(eds => [...eds, ...newEdges]);
    setIsDirty(true);
  }, [nodeTypeList, setNodes, setEdges, setIsDirty]);

  const handleUpdateNode = useCallback((nodeId: string, data: Record<string, unknown>) => {
    // Config panel edits schema-driven fields; it hands back the node's own data shape.
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data } as AppNode : n));
    setIsDirty(true);
  }, [setNodes, setIsDirty]);

  const onDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeType: PipelineNodeType) => {
    event.dataTransfer.setData('application/pipeline-node', JSON.stringify(nodeType));
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const data = event.dataTransfer.getData('application/pipeline-node');
    if (!data) return;
    const nodeType = JSON.parse(data) as PipelineNodeType;
    const bounds = reactFlowWrapperRef.current?.getBoundingClientRect();
    if (!bounds) return;
    addNode(nodeType, { x: event.clientX - bounds.left - 90, y: event.clientY - bounds.top - 20 });
    setIsDirty(true);
  }, [addNode, setIsDirty, reactFlowWrapperRef]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: AppNode) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  return {
    handleAutoLayout, duplicateNode, handleDuplicate, deleteNode,
    copyNodeConfig, pasteNodeConfig, handleQuickAdd, handleAddComment, handleAddGroup,
    handleBulkDelete, handleBulkDuplicate, handleLayoutSelection, handleDeselectAll,
    updateEdgeCondition, deleteEdge, handleImport, handleTemplateApply,
    handleUpdateNode, onDragStart, onDragOver, onDrop, onNodeClick,
  };
}

export function usePipelineDerived(
  nodes: AppNode[],
  edges: AppEdge[],
  nodeTypeList: PipelineNodeType[] | undefined,
  paletteSearch: string,
  selectedNodeId: string | null,
) {
  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const selectedForTemplate = useMemo(() => {
    const selectedNodes = nodes.filter(n => n.selected);
    const selectedIds = new Set(selectedNodes.map(n => n.id));
    const selectedEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
    return { nodes: selectedNodes, edges: selectedEdges };
  }, [nodes, edges]);

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

  const validationIssues = useMemo(() => {
    if (!nodeTypeList) return { count: 0, nodeIds: new Set<string>() };
    const nodeIds = new Set<string>();
    for (const n of nodes) {
      if (!isBaseNode(n)) continue;
      const nt = nodeTypeList.find(t => t.slug === n.data.nodeTypeSlug);
      const schema = nt?.config_schema as { required?: string[] } | undefined;
      const required = schema?.required || [];
      const config = n.data.config || {};
      const missing = required.some(k => config[k] === undefined || config[k] === null || config[k] === '');
      if (missing) nodeIds.add(n.id);
    }
    return { count: nodeIds.size, nodeIds };
  }, [nodes, nodeTypeList]);

  return { selectedNode, selectedForTemplate, nodeTypesByCategory, validationIssues };
}
