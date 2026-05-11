import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, User, Zap } from 'lucide-react';
import { EntityPreviewCard } from './EntityPreviewCard';
import { FieldDiffView, computeFieldDiffs } from './FieldDiffView';
import { ActionBar } from './ActionBar';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';
import { useEntityData, useStagingData } from '@/hooks/useTriageDetail';

interface TriageDetailPanelProps {
  item: TriageItem;
  onAction: (action: 'approve' | 'reject' | 'skip' | 'flag', notes?: string, cannedSlug?: string) => void;
  isActionLoading: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TriageDetailPanel({ item, onAction, isActionLoading }: TriageDetailPanelProps) {
  const { data: entityData, isLoading: entityLoading } = useEntityData(item);
  const { data: stagingData } = useStagingData(item);

  const diffs = item.has_diff && entityData && stagingData
    ? computeFieldDiffs(
        entityData as Record<string, unknown>,
        (stagingData as Record<string, unknown>)?.normalized_data as Record<string, unknown> ?? null,
      )
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {item.queue_type}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {item.content_type}
          </Badge>
          {item.confidence_score !== null && (
            <Badge variant="secondary" className="text-[10px]">
              {(item.confidence_score * 100).toFixed(0)}%
            </Badge>
          )}
        </div>
        <h2 className="text-sm font-medium">{item.title}</h2>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(item.created_at)}
          </span>
          {item.source && (
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {item.source}
            </span>
          )}
          {item.reporter_id && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              Reporter
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {entityLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <EntityPreviewCard item={item} entityData={entityData ?? null} />

            {diffs.length > 0 && (
              <div className="border-t">
                <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                  Changes
                </p>
                <FieldDiffView diffs={diffs} />
              </div>
            )}

            {/* Meta / AI reasoning */}
            {item.meta && Object.keys(item.meta).length > 0 && (
              <div className="border-t">
                <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                  Context
                </p>
                <pre className="text-[10px] text-muted-foreground p-3 overflow-auto max-h-32">
                  {JSON.stringify(item.meta, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action bar */}
      <ActionBar onAction={onAction} isLoading={isActionLoading} />
    </div>
  );
}
