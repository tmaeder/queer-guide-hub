import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type DragEvent,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Save, Play, PlayCircle, BarChart3, Upload, Plus, Clock } from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router';

import BaseNode from './nodes/BaseNode';
import NodeConfigPanel from './panels/NodeConfigPanel';
import { usePipelineBuilder, usePipelineNodeTypes, usePipelineDefinitions, type PipelineNodeType } from './hooks/usePipelineBuilder';
import { usePipelineExecution } from './hooks/usePipelineExecution';
import { useLatestPipelineRun } from './hooks/usePipelineHistory';
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
  const [params, setParams] = useSearchParams();
  const { data: nodeTypeList } = usePipelineNodeTypes();
  const { data: pipelineList } = usePipelineDefinitions();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const initialPipelineParam = params.get('pipeline') ?? params.get('pipeline_id') ?? undefined;
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | undefined>(undefined);

  // Resolve pipeline name → id once list loads. If no param given, default to the
  // bulletproof events pipeline so the canvas is never empty on first visit.
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
    nodes, edges, setNodes,
    onNodesChange, onEdgesChange, onConnect,
    addNode, pipelineName, setPipelineName,
    save, isSaving, run, isRunning,
    selectedNodeId, setSelectedNodeId,
    loadPipeline,
  } = usePipelineBuilder(selectedPipelineId);

  // Auto-load the selected pipeline definition (wait for nodeTypes so icons/colors populate)
  useEffect(() => {
    if (!selectedPipelineId || !pipelineList || !nodeTypeList) return;
    const def = pipelineList.find(p => p.id === selectedPipelineId);
    if (def) loadPipeline(def, nodeTypeList);
  }, [selectedPipelineId, pipelineList, nodeTypeList, loadPipeline]);

  const { runStatus, clearOverlay } = usePipelineExecution(activeRunId, setNodes);

  // Auto-overlay the latest run's node_states when a pipeline loads (so admins
  // see the most recent execution status without clicking Run). Live realtime
  // takes over when activeRunId is set.
  const { data: latestRun } = useLatestPipelineRun(selectedPipelineId);
  useEffect(() => {
    if (!latestRun || activeRunId) return;
    const states = latestRun.node_states || {};
    setNodes((current) => current.map((node) => {
      const s = states[node.id];
      return s ? { ...node, data: {
        ...node.data,
        status: s.status,
        itemsOut: s.items_out,
        itemsIn: s.items_in,
        durationMs: s.duration_ms,
        errorMessage: s.error,
      } } : node;
    }));
  }, [latestRun, activeRunId, setNodes]);

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const handleUpdateNode = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data } : n));
  }, [setNodes]);

  const handleRun = useCallback((opts?: { dryRun?: boolean }) => {
    run(opts, {
      onSuccess: (data: Record<string, unknown>) => {
        if (data?.pipeline_run_id) {
          setActiveRunId(data.pipeline_run_id as string);
        }
      },
    } as Record<string, unknown>);
  }, [run]);

  const nodeTypesByCategory = useMemo(() => {
    if (!nodeTypeList) return {};
    const grouped: Record<string, PipelineNodeType[]> = {};
    for (const nt of nodeTypeList) {
      if (!grouped[nt.category]) grouped[nt.category] = [];
      grouped[nt.category].push(nt);
    }
    return grouped;
  }, [nodeTypeList]);

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

      const position = {
        x: event.clientX - bounds.left - 90,
        y: event.clientY - bounds.top - 20,
      };

      addNode(nodeType, position);
    },
    [addNode]
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  // Measure available height and lock the layout
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerHeight(window.innerHeight - rect.top);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div ref={containerRef} style={{ display: 'flex', height: containerHeight, overflow: 'hidden', margin: '-16px -24px' }}>
      {/* Sidebar — Node Palette */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e7eb', background: '#fafafa', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Node Palette</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Drag nodes onto the canvas</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {categoryOrder.map(cat => {
              const types = nodeTypesByCategory[cat];
              if (!types || types.length === 0) return null;
              return (
                <div key={cat}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px', marginBottom: 4 }}>
                    {categoryLabels[cat] || cat}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {types.map(nt => {
                      const Icon = (Icons as Record<string, unknown>)[nt.icon] as React.ComponentType<{ className?: string }> || Icons.Box;
                      return (
                        <div
                          key={nt.slug}
                          role="button"
                          tabIndex={0}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'grab', fontSize: 13 }}
                          draggable
                          onDragStart={(e) => onDragStart(e as unknown as DragEvent<HTMLDivElement>, nt)}
                        >
                          <div
                            style={{ width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: `${nt.color}20`, color: nt.color }}
                          >
                            <Icon className="h-3 w-3" />
                          </div>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nt.display_name}</span>
                        </div>
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, zIndex: 10 }}>
          <select
            value={selectedPipelineId ?? ''}
            onChange={(e) => {
              const id = e.target.value || undefined;
              setSelectedPipelineId(id);
              if (id) {
                const def = pipelineList?.find(p => p.id === id);
                if (def) setParams(prev => {
                  const next = new URLSearchParams(prev);
                  next.set('pipeline', def.name);
                  return next;
                });
              } else {
                setParams(prev => { const next = new URLSearchParams(prev); next.delete('pipeline'); return next; });
              }
            }}
            style={{ height: 32, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, minWidth: 220 }}
          >
            <option value="">— New pipeline —</option>
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
              setSelectedPipelineId(undefined);
              setNodes([]);
              setPipelineName('');
              setParams(prev => { const next = new URLSearchParams(prev); next.delete('pipeline'); return next; });
            }}
            title="Start a new blank pipeline"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
          <Input
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            placeholder="Pipeline name..."
            className="w-64 h-8 text-sm"
          />
          <Separator orientation="vertical" className="h-6" />
          <Button size="sm" variant="outline" onClick={() => save()} disabled={isSaving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleRun({ dryRun: true })} disabled={isRunning}>
            <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
            Dry Run
          </Button>
          <Button size="sm" onClick={() => handleRun()} disabled={isRunning}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {isRunning ? 'Starting...' : 'Run'}
          </Button>
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
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6b7280' }}>
            {latestRun && !activeRunId && (
              <Badge
                variant="outline"
                className={`text-xs gap-1 ${
                  latestRun.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                  latestRun.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                  latestRun.status === 'running' ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
                  'bg-gray-50 text-gray-700'
                }`}
                title={`Run ${latestRun.id.slice(0, 8)} • ${latestRun.items_succeeded ?? 0}/${latestRun.items_total ?? 0} succeeded${latestRun.error_message ? ` • ${latestRun.error_message}` : ''}`}
              >
                <Clock className="h-3 w-3" />
                Last: {formatDistanceToNow(new Date(latestRun.started_at || latestRun.created_at), { addSuffix: true })} • {latestRun.status}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">{nodes.length} nodes</Badge>
            <Badge variant="outline" className="text-xs">{edges.length} edges</Badge>
            {(() => {
              const def = pipelineList?.find(p => p.id === selectedPipelineId);
              if (!def || !latestRun?.pipeline_version) return null;
              if (latestRun.pipeline_version === def.version) return null;
              return (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 bg-amber-50 text-amber-700 border-amber-200"
                  title={`DAG was edited (current v${def.version}) since the last run (v${latestRun.pipeline_version}). Run again to refresh metrics.`}
                >
                  edited since last run (v{latestRun.pipeline_version}→v{def.version})
                </Badge>
              );
            })()}
            <Separator orientation="vertical" className="h-4 mx-1" />
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate('/admin/pipelines?tab=monitor')}>
              <BarChart3 className="h-3 w-3 mr-1" /> Monitor
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate('/admin/imports')}>
              <Upload className="h-3 w-3 mr-1" /> Imports
            </Button>
          </div>
        </div>

        {/* React Flow Canvas */}
        <div ref={reactFlowWrapper} style={{ flex: 1, minHeight: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop as React.DragEventHandler}
            onDragOver={onDragOver as React.DragEventHandler}
            onNodeClick={onNodeClick as (event: React.MouseEvent, node: unknown) => void}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            fitView
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
    </div>
  );
}

// Note: ReactFlowProvider is provided by UnifiedDataOps wrapper
export default function PipelineBuilder() {
  return <PipelineBuilderInner />;
}
