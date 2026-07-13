import { useMemo } from 'react';
import { ReactFlow, ReactFlowProvider, Background, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import BaseNode from '../nodes/BaseNode';
import CommentNode from '../nodes/CommentNode';
import GroupNode from '../nodes/GroupNode';
import { usePipelineRun } from '../hooks/usePipelineHistory';
import { usePipelineNodeTypes, storedNodesToCanvas } from '../hooks/usePipelineBuilder';
import { autoLayout } from '../utils/autoLayout';
import { isBaseNode, type AppNode, type AppEdge } from '../types';

const nodeTypes = { baseNode: BaseNode, commentNode: CommentNode, groupNode: GroupNode };

interface RunSnapshotDialogProps {
  runId: string | null;
  onClose: () => void;
}

/**
 * Read-only canvas of a historical run: the pipeline version that actually ran
 * (pipeline_snapshot) with that run's per-node status/metrics overlaid.
 */
export default function RunSnapshotDialog({ runId, onClose }: RunSnapshotDialogProps) {
  const { data: run } = usePipelineRun(runId || undefined);
  const { data: nodeTypeList } = usePipelineNodeTypes();

  const { nodes, edges } = useMemo((): { nodes: AppNode[]; edges: AppEdge[] } => {
    if (!run?.pipeline_snapshot?.nodes) return { nodes: [], edges: [] };
    const canvas = storedNodesToCanvas(run.pipeline_snapshot.nodes, nodeTypeList);
    const snapEdges = (run.pipeline_snapshot.edges || []).map(e => ({ ...e, animated: false }));
    const states = run.node_states || {};
    const withStates = canvas.map(n => {
      if (!isBaseNode(n)) return n;
      const s = states[n.id];
      if (!s) return n;
      return {
        ...n,
        data: {
          ...n.data,
          status: s.status, itemsIn: s.items_in, itemsOut: s.items_out,
          durationMs: s.duration_ms, errorMessage: s.error,
        },
      };
    });
    const hasPositions = run.pipeline_snapshot.nodes.some(n => n.position);
    return { nodes: hasPositions ? withStates : autoLayout(withStates, snapEdges), edges: snapEdges };
  }, [run, nodeTypeList]);

  const hasSnapshot = !!run?.pipeline_snapshot?.nodes?.length;

  return (
    <Dialog open={!!runId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Run on canvas
            {run && <Badge variant="outline" className="text-2xs font-mono">{run.id.slice(0, 8)}</Badge>}
            {run?.pipeline_version && <Badge variant="outline" className="text-2xs font-mono">v{run.pipeline_version}</Badge>}
            {run && <Badge variant="outline" className="text-2xs">{run.status}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {run
              ? `Pipeline as it ran ${run.started_at ? format(new Date(run.started_at), 'PPp') : ''} — read-only, per-node results overlaid.`
              : 'Loading run…'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border border-border rounded-element overflow-hidden">
          {!hasSnapshot ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground px-6 text-center">
              {run ? 'No pipeline snapshot was stored for this run (older runs predate snapshots).' : 'Loading…'}
            </div>
          ) : (
            <ReactFlowProvider>
              <ReactFlow<AppNode, AppEdge>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                edgesFocusable={false}
                deleteKeyCode={null}
                minZoom={0.2}
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
            </ReactFlowProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
