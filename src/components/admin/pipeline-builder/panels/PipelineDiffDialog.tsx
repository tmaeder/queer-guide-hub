import { useMemo } from 'react';
import { GitCompare, Plus, Minus, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Node, Edge } from '@xyflow/react';

interface PipelineDiffDialogProps {
  currentNodes: Node[];
  currentEdges: Edge[];
  savedDef?: { nodes: Node[]; edges: Edge[] } | null;
}

interface NodeDiff {
  added: Node[];
  removed: Node[];
  modified: Array<{ current: Node; saved: Node; changes: string[] }>;
}

interface EdgeDiff {
  added: Edge[];
  removed: Edge[];
}

function computeDiff(
  currentNodes: Node[], currentEdges: Edge[],
  savedNodes: Node[], savedEdges: Edge[],
): { nodes: NodeDiff; edges: EdgeDiff } {
  const currentIds = new Set(currentNodes.map(n => n.id));
  const savedIds = new Set(savedNodes.map(n => n.id));

  const nodes: NodeDiff = {
    added: currentNodes.filter(n => !savedIds.has(n.id)),
    removed: savedNodes.filter(n => !currentIds.has(n.id)),
    modified: [],
  };

  const savedMap = new Map(savedNodes.map(n => [n.id, n]));
  for (const cur of currentNodes) {
    const saved = savedMap.get(cur.id);
    if (!saved) continue;
    const changes: string[] = [];
    const curD = cur.data as Record<string, unknown>;
    const savedD = saved.data as Record<string, unknown>;

    if (curD.label !== savedD.label) changes.push('label');
    if (JSON.stringify(curD.config ?? {}) !== JSON.stringify(savedD.config ?? {})) changes.push('config');
    if (Math.abs((cur.position?.x || 0) - (saved.position?.x || 0)) > 1
        || Math.abs((cur.position?.y || 0) - (saved.position?.y || 0)) > 1) changes.push('position');
    if (changes.length > 0) {
      nodes.modified.push({ current: cur, saved, changes });
    }
  }

  const edgeKey = (e: Edge) => `${e.source}:${e.sourceHandle ?? ''}→${e.target}:${e.targetHandle ?? ''}`;
  const currentEdgeKeys = new Set(currentEdges.map(edgeKey));
  const savedEdgeKeys = new Set(savedEdges.map(edgeKey));

  const edges: EdgeDiff = {
    added: currentEdges.filter(e => !savedEdgeKeys.has(edgeKey(e))),
    removed: savedEdges.filter(e => !currentEdgeKeys.has(edgeKey(e))),
  };

  return { nodes, edges };
}

export default function PipelineDiffDialog({ currentNodes, currentEdges, savedDef }: PipelineDiffDialogProps) {
  const diff = useMemo(() => {
    if (!savedDef) return null;
    return computeDiff(currentNodes, currentEdges, savedDef.nodes || [], savedDef.edges || []);
  }, [currentNodes, currentEdges, savedDef]);

  const totalChanges = diff
    ? diff.nodes.added.length + diff.nodes.removed.length + diff.nodes.modified.length + diff.edges.added.length + diff.edges.removed.length
    : 0;

  const labelFor = (n: Node) => (n.data as { label?: string; nodeTypeSlug?: string })?.label
    || (n.data as { nodeTypeSlug?: string })?.nodeTypeSlug
    || n.id;

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 relative" disabled={!savedDef || totalChanges === 0}>
              <GitCompare className="h-3.5 w-3.5" />
              {totalChanges > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                  {totalChanges > 9 ? '9+' : totalChanges}
                </span>
              )}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          {totalChanges > 0 ? `${totalChanges} unsaved change${totalChanges === 1 ? '' : 's'}` : 'No changes vs saved'}
        </TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Changes vs saved version
          </DialogTitle>
          <DialogDescription>
            Diff of current canvas state against the last saved pipeline definition.
          </DialogDescription>
        </DialogHeader>

        {!diff ? (
          <div className="text-sm text-muted-foreground text-center py-10">No saved version to compare against.</div>
        ) : totalChanges === 0 ? (
          <div className="text-sm text-green-600 text-center py-10 font-medium">✓ No changes — canvas matches saved</div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-3">
            {diff.nodes.added.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-1.5">
                  <Plus className="h-3 w-3" />
                  Nodes added ({diff.nodes.added.length})
                </div>
                <div className="space-y-1">
                  {diff.nodes.added.map(n => (
                    <div key={n.id} className="text-xs font-mono bg-green-50 border border-green-200 rounded px-2 py-1 flex gap-2">
                      <span className="text-green-700">+</span>
                      <span>{labelFor(n)}</span>
                      <span className="text-muted-foreground ml-auto text-[10px]">{n.id.slice(0, 16)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.nodes.removed.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive mb-1.5">
                  <Minus className="h-3 w-3" />
                  Nodes removed ({diff.nodes.removed.length})
                </div>
                <div className="space-y-1">
                  {diff.nodes.removed.map(n => (
                    <div key={n.id} className="text-xs font-mono bg-red-50 border border-red-200 rounded px-2 py-1 flex gap-2">
                      <span className="text-destructive">−</span>
                      <span>{labelFor(n)}</span>
                      <span className="text-muted-foreground ml-auto text-[10px]">{n.id.slice(0, 16)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.nodes.modified.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-1.5">
                  <Pencil className="h-3 w-3" />
                  Nodes modified ({diff.nodes.modified.length})
                </div>
                <div className="space-y-1">
                  {diff.nodes.modified.map(m => (
                    <div key={m.current.id} className="text-xs font-mono bg-amber-50 border border-amber-200 rounded px-2 py-1 flex gap-2 items-center">
                      <span className="text-amber-700">~</span>
                      <span>{labelFor(m.current)}</span>
                      <div className="flex gap-1">
                        {m.changes.map(c => (
                          <Badge key={c} variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-100/50">{c}</Badge>
                        ))}
                      </div>
                      <span className="text-muted-foreground ml-auto text-[10px]">{m.current.id.slice(0, 16)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.edges.added.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-1.5">
                  <Plus className="h-3 w-3" />
                  Edges added ({diff.edges.added.length})
                </div>
                <div className="space-y-1">
                  {diff.edges.added.map(e => (
                    <div key={e.id} className="text-xs font-mono bg-green-50 border border-green-200 rounded px-2 py-1 flex gap-2 truncate">
                      <span className="text-green-700">+</span>
                      <span className="truncate">
                        {e.source.slice(0, 20)} <span className="text-muted-foreground mx-1">→</span> {e.target.slice(0, 20)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.edges.removed.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive mb-1.5">
                  <Minus className="h-3 w-3" />
                  Edges removed ({diff.edges.removed.length})
                </div>
                <div className="space-y-1">
                  {diff.edges.removed.map(e => (
                    <div key={e.id} className="text-xs font-mono bg-red-50 border border-red-200 rounded px-2 py-1 flex gap-2 truncate">
                      <span className="text-destructive">−</span>
                      <span className="truncate">
                        {e.source.slice(0, 20)} <span className="text-muted-foreground mx-1">→</span> {e.target.slice(0, 20)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
