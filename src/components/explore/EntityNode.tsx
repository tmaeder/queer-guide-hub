import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Image } from '@/components/ui/Image';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { type FallbackTheme } from '@/utils/fallbackImages';

export type EgoNodeData = {
  title: string;
  entityType: string;
  category?: string;
  place?: string;
  imageUrl?: string | null;
  href?: string | null;
  isCenter?: boolean;
  expanded?: boolean;
  loading?: boolean;
};

export type EgoFlowNode = Node<EgoNodeData, 'entityNode'>;

function fallbackTheme(type: string): FallbackTheme {
  switch (type) {
    case 'venue': return 'venue';
    case 'event': return 'event';
    case 'hotel': return 'hotel';
    case 'news': return 'news';
    case 'marketplace': return 'marketplace';
    case 'personality': case 'person': return 'person';
    default: return 'place';
  }
}

/** Centered, invisible handles so edges radiate from card centers. */
const handleClass = '!opacity-0 !pointer-events-none !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2';

function EntityNode({ data: d, id }: NodeProps<EgoFlowNode>) {
  const { t } = useTranslation();
  return (
    <div
      className={`w-44 rounded-element border bg-background overflow-hidden transition-all cursor-pointer hover:border-foreground/40 ${
        d.isCenter ? 'ring-2 ring-ring border-foreground' : ''
      } ${d.expanded ? '' : 'border-dashed'}`}
      data-testid={`ego-node-${id}`}
    >
      <Handle type="target" position={Position.Top} className={handleClass} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className={handleClass} isConnectable={false} />

      <Image
        src={d.imageUrl}
        alt=""
        aspect="card"
        imageRole="thumb"
        rounded="none"
        fallbackEntityType={fallbackTheme(d.entityType)}
        fallbackKey={id}
        className="h-20"
        heightPx={80}
      />

      <div className="p-2">
        <div className="flex items-start gap-1">
          <span className="text-13 font-medium leading-tight line-clamp-2 flex-1">
            {d.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : d.title}
          </span>
          {d.href && (
            <LocalizedLink
              to={d.href}
              aria-label={t('connections.open', { title: d.title })}
              className="shrink-0 p-0.5 rounded-badge text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </LocalizedLink>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 min-w-0">
          <Badge variant="outline" className="text-3xs px-1 py-0 shrink-0">
            {d.entityType}
          </Badge>
          {d.place && (
            <span className="text-2xs text-muted-foreground truncate">{d.place}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(EntityNode);
