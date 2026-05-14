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

/** Keys to hide from meta display — internal or already shown in header */
const META_HIDDEN_KEYS = new Set([
  'id', 'entity_id', 'entity_table', 'queue_type', 'content_type',
  'title', 'subtitle', 'status', 'created_at', 'updated_at',
  'normalized_data', 'raw_data', 'source_data',
]);

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (value >= 0 && value <= 1 && value !== 0 && value !== 1) {
      return `${Math.round(value * 100)}%`;
    }
    return String(value);
  }
  if (typeof value === 'string') {
    if (/^[A-Z][A-Z_-]+$/.test(value)) {
      return value.replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return value;
  }
  if (Array.isArray(value)) return value.join(', ');
  return JSON.stringify(value);
}

function formatMetaKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanize(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

  const metaEntries = item.meta
    ? Object.entries(item.meta).filter(
        ([k, v]) => !META_HIDDEN_KEYS.has(k) && v !== null && v !== undefined && v !== '',
      )
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] normal-case">
            {humanize(item.queue_type)}
          </Badge>
          <Badge variant="secondary" className="text-[10px] normal-case">
            {humanize(item.content_type)}
          </Badge>
          {item.confidence_score !== null && (
            <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
              Confidence: {(item.confidence_score * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <h2 className="text-base font-medium leading-tight">{item.title}</h2>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground">{humanize(item.subtitle)}</p>
        )}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(item.created_at)}
          </span>
          {item.source && (
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {humanize(item.source)}
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

            {/* Structured meta */}
            {metaEntries.length > 0 && (
              <div className="border-t">
                <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                  Context
                </p>
                <div className="divide-y">
                  {metaEntries.map(([key, value]) => (
                    <div key={key} className="flex items-baseline gap-3 px-3 py-1.5 text-xs">
                      <span className="text-muted-foreground shrink-0 w-32 text-[10px] uppercase tracking-wider">
                        {formatMetaKey(key)}
                      </span>
                      <span className="min-w-0 break-words">
                        {formatMetaValue(value)}
                      </span>
                    </div>
                  ))}
                </div>
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
