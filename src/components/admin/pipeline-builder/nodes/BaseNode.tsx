import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import * as Icons from 'lucide-react';

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
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700 animate-pulse',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-yellow-100 text-yellow-600',
};

function BaseNode({ data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData;
  const IconComponent = nodeData.icon ? (Icons as Record<string, unknown>)[nodeData.icon] as React.ComponentType<{ className?: string }> : Icons.Box;
  const color = nodeData.color || '#6b7280';

  return (
    <div
      className={`rounded-lg border-2 bg-white shadow-sm min-w-[180px] transition-shadow ${
        selected ? 'ring-2 ring-blue-500 shadow-md' : ''
      }`}
      style={{ borderColor: color }}
    >
      {/* Input handles */}
      {(nodeData.inputPorts || []).map((port, i) => (
        <Handle
          key={port.id}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{
            top: `${((i + 1) / ((nodeData.inputPorts?.length || 1) + 1)) * 100}%`,
            background: color,
            width: 10,
            height: 10,
          }}
        />
      ))}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-md"
        style={{ backgroundColor: `${color}15` }}
      >
        {IconComponent && <IconComponent className="h-4 w-4 shrink-0" />}
        <span className="text-sm font-medium truncate">
          {nodeData.label || nodeData.nodeTypeSlug || 'Node'}
        </span>
        {nodeData.status && (
          <Badge variant="outline" className={`ml-auto text-[10px] px-1.5 py-0 ${statusColors[nodeData.status]}`}>
            {nodeData.status}
          </Badge>
        )}
      </div>

      {/* Body */}
      {(nodeData.description || nodeData.itemsOut !== undefined) && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-t" style={{ borderColor: `${color}30` }}>
          {nodeData.description && <div className="truncate">{nodeData.description}</div>}
          {nodeData.itemsOut !== undefined && (
            <div className="mt-1 font-mono">{nodeData.itemsOut} items</div>
          )}
        </div>
      )}

      {/* Output handles */}
      {(nodeData.outputPorts || []).map((port, i) => (
        <Handle
          key={port.id}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{
            top: `${((i + 1) / ((nodeData.outputPorts?.length || 1) + 1)) * 100}%`,
            background: color,
            width: 10,
            height: 10,
          }}
        />
      ))}
    </div>
  );
}

export default memo(BaseNode);
