import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { resolvePipelineIcon, AlertCircle, ArrowDownToLine, ArrowUpFromLine, Timer } from '../icon-registry';

interface BaseNodeData {
  label?: string;
  config?: Record<string, unknown>;
  icon?: string;
  color?: string;
  category?: string;
  description?: string;
  nodeTypeSlug?: string;
  inputPorts?: Array<{ id: string; label: string; type: string }>;
  outputPorts?: Array<{ id: string; label: string; type: string }>;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  itemsOut?: number;
  itemsIn?: number;
  durationMs?: number;
  errorMessage?: string;
  hasValidationIssue?: boolean;
}

const statusConfig: Record<string, { className: string; icon: string }> = {
  pending:   { className: 'bg-muted text-muted-foreground', icon: 'Clock' },
  running:   { className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 animate-pulse', icon: 'Loader2' },
  completed: { className: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', icon: 'CheckCircle2' },
  failed:    { className: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300', icon: 'XCircle' },
  skipped:   { className: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400', icon: 'SkipForward' },
};

function portPosition(index: number, total: number): string {
  if (total <= 1) return '50%';
  return `${((index + 1) / (total + 1)) * 100}%`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function BaseNode({ data, selected }: NodeProps) {
  const d = data as BaseNodeData;
  const IconComponent = resolvePipelineIcon(d.icon);
  const color = d.color || '#6b7280';
  const status = d.status;
  const sc = status ? statusConfig[status] : null;
  const StatusIcon = sc ? resolvePipelineIcon(sc.icon) : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`rounded-element border-2 bg-background shadow-sm min-w-[200px] max-w-[280px] transition-all ${
          selected ? 'ring-2 ring-ring shadow-md scale-[1.02]' : 'hover:shadow-md'
        } ${status === 'failed' ? 'border-destructive' : ''}`}
        style={{ borderColor: status === 'failed' ? undefined : color }}
      >
        {/* Input handles */}
        {(d.inputPorts || []).map((port, i) => (
          <Tooltip key={port.id}>
            <TooltipTrigger asChild>
              <Handle
                type="target"
                position={Position.Left}
                id={port.id}
                style={{
                  top: portPosition(i, d.inputPorts?.length || 0),
                  background: status === 'failed' ? 'hsl(var(--destructive))' : color,
                  width: 10,
                  height: 10,
                  border: '2px solid hsl(var(--background))',
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">{port.label || port.id}</TooltipContent>
          </Tooltip>
        ))}

        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-t-md"
          style={{ backgroundColor: `${color}12` }}
        >
          {IconComponent && <IconComponent className="h-4 w-4 shrink-0" />}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-medium truncate max-w-[140px]">
                {d.label || d.nodeTypeSlug || 'Node'}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {d.label || d.nodeTypeSlug || 'Node'}
              {d.description && <div className="text-muted-foreground mt-0.5">{d.description}</div>}
            </TooltipContent>
          </Tooltip>
          {d.hasValidationIssue && !sc && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 ml-auto shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="text-xs">Missing required config</TooltipContent>
            </Tooltip>
          )}
          {sc && (
            <Badge variant="outline" className={`ml-auto text-2xs px-1.5 py-0 gap-1 ${sc.className}`}>
              {StatusIcon && <StatusIcon className="h-2.5 w-2.5" />}
              {status}
            </Badge>
          )}
        </div>

        {/* Metrics bar */}
        {(d.itemsOut !== undefined || d.itemsIn !== undefined || d.durationMs) && (
          <div className="flex items-center gap-3 px-3 py-1.5 text-xs2 font-mono border-t border-border/50">
            {d.itemsIn !== undefined && (
              <span className="text-muted-foreground" title="items in">
                <ArrowDownToLine className="h-3 w-3 inline mr-0.5" />{d.itemsIn}
              </span>
            )}
            {d.itemsOut !== undefined && (
              <span className="font-semibold" style={{ color }} title="items out">
                <ArrowUpFromLine className="h-3 w-3 inline mr-0.5" />{d.itemsOut}
              </span>
            )}
            {d.durationMs !== undefined && d.durationMs > 0 && (
              <span className="ml-auto text-muted-foreground" title="duration">
                <Timer className="h-3 w-3 inline mr-0.5" />{formatDuration(d.durationMs)}
              </span>
            )}
          </div>
        )}

        {/* Error message */}
        {d.errorMessage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="px-3 py-1.5 text-2xs text-destructive bg-destructive/5 border-t border-destructive/20 truncate cursor-help">
                {d.errorMessage}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[300px] whitespace-pre-wrap">
              {d.errorMessage}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Output handles */}
        {(d.outputPorts || []).map((port, i) => (
          <Tooltip key={port.id}>
            <TooltipTrigger asChild>
              <Handle
                type="source"
                position={Position.Right}
                id={port.id}
                style={{
                  top: portPosition(i, d.outputPorts?.length || 0),
                  background: status === 'failed' ? 'hsl(var(--destructive))' : color,
                  width: 10,
                  height: 10,
                  border: '2px solid hsl(var(--background))',
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{port.label || port.id}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

export default memo(BaseNode);
