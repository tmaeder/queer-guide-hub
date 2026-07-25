import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { typeMeta, type GraphCategory } from './contentGraphMeta';

export type TypeNodeData = {
  type: string;
  label: string;
  category: GraphCategory;
  count: number;
  orphanCount: number | null;
  dupCount: number;
  selected?: boolean;
};
export type TypeFlowNode = Node<TypeNodeData, 'typeNode'>;

const handleClass =
  '!opacity-0 !pointer-events-none !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2';

const nf = new Intl.NumberFormat('en-US');

function TypeNode({ data: d }: NodeProps<TypeFlowNode>) {
  const Icon = typeMeta(d.type).icon;
  return (
    <div
      className={`w-40 rounded-element border bg-background overflow-hidden transition-colors cursor-pointer hover:border-foreground/50 ${
        d.selected ? 'ring-2 ring-ring border-foreground' : 'border-border'
      }`}
      data-testid={`type-node-${d.type}`}
    >
      <Handle type="target" position={Position.Top} className={handleClass} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className={handleClass} isConnectable={false} />

      <div className="flex items-center gap-2 px-4 pt-2.5">
        <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-13 font-medium leading-tight flex-1 min-w-0 truncate">{d.label}</span>
      </div>
      <div className="px-4 pb-2.5 pt-1">
        <span className="text-title font-display tabular-nums">{nf.format(d.count)}</span>
        {(d.orphanCount != null && d.orphanCount > 0) || d.dupCount > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {d.orphanCount != null && d.orphanCount > 0 && (
              <Badge variant="destructive" className="text-2xs px-1 py-0 tabular-nums" title="Records missing their primary link">
                {nf.format(d.orphanCount)} orphan
              </Badge>
            )}
            {d.dupCount > 0 && (
              <Badge variant="secondary" className="text-2xs px-1 py-0 tabular-nums" title="Records flagged as duplicates">
                {nf.format(d.dupCount)} dup
              </Badge>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(TypeNode);
