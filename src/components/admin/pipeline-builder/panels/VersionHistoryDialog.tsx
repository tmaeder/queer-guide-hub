import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { History, RotateCcw, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { Node, Edge } from '@xyflow/react';

interface VersionRow {
  id: string;
  pipeline_id: string;
  version: number;
  name: string;
  display_name: string | null;
  description: string | null;
  nodes: Node[];
  edges: Edge[];
  schedule: string | null;
  saved_by: string | null;
  saved_at: string;
}

interface VersionHistoryDialogProps {
  pipelineId: string | undefined;
  currentVersion?: number;
  onRevert: (version: VersionRow) => void;
}

export default function VersionHistoryDialog({ pipelineId, currentVersion, onRevert }: VersionHistoryDialogProps) {
  const [open, setOpen] = useState(false);

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['pipeline-versions', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];
      const { data, error } = await untypedFrom('pipeline_definition_versions')
        .select('id, pipeline_id, version, name, display_name, description, nodes, edges, schedule, saved_by, saved_at')
        .eq('pipeline_id', pipelineId)
        .order('version', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as VersionRow[];
    },
    enabled: open && !!pipelineId,
  });

  const handleRevert = (v: VersionRow) => {
    if (v.version === currentVersion) return;
    if (!window.confirm(`Revert canvas to v${v.version}? Your current unsaved work will be replaced. You'll still need to Save to persist.`)) return;
    onRevert(v);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={!pipelineId}>
              <History className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Version history</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Version history
          </DialogTitle>
          <DialogDescription>
            Each save creates a snapshot. Revert to an older version to load it on the canvas (not saved until you click Save).
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-xs">Loading…</div>
          ) : versions.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs">No version history yet</div>
          ) : (
            <div className="divide-y divide-border">
              {versions.map(v => {
                const isCurrent = v.version === currentVersion;
                return (
                  <div key={v.id} className="p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-mono ${isCurrent ? 'bg-primary/10 text-primary border-primary/30' : ''}`}>
                          v{v.version}
                        </Badge>
                        {isCurrent && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900">current</Badge>}
                        <span className="text-xs text-muted-foreground" title={new Date(v.saved_at).toISOString()}>
                          {formatDistanceToNow(new Date(v.saved_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-3">
                        <span>{v.nodes?.length || 0} nodes · {v.edges?.length || 0} edges</span>
                        {v.schedule && <span className="font-mono">{v.schedule}</span>}
                        {v.saved_by && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1 cursor-help">
                                <User className="h-2.5 w-2.5" />
                                <span className="font-mono">{v.saved_by.slice(0, 8)}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs font-mono">{v.saved_by}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isCurrent ? 'ghost' : 'outline'}
                      className="h-7 text-xs"
                      disabled={isCurrent}
                      onClick={() => handleRevert(v)}
                    >
                      {isCurrent ? (
                        'Current'
                      ) : (
                        <>
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Revert
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
