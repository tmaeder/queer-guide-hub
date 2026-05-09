import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Server,
  Hash,
  Zap,
  Copy,
  Github,
  MessageSquarePlus,
  Check,
  ShieldAlert,
  GripVertical,
} from 'lucide-react';
import { timeAgo } from '@/utils/timezone';
import { kanbanColumns, type KanbanStatus } from './constants';
import { SERVICE_COLORS, type ApiErrorSubmission } from './claudePrompts';
import { SparklineCell } from './analytics/SparklineCell';
import { toDailySeries, type ApiErrorDailyRow } from '@/hooks/useFeedbackAnalytics';
import { cn } from '@/lib/utils';

interface Props {
  errors: ApiErrorSubmission[];
  dailySeries: ApiErrorDailyRow[];
  onCopyPrompt: (item: ApiErrorSubmission) => void;
  onForward: (id: string) => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  forwardingIds: Set<string>;
}

function extractTitle(item: ApiErrorSubmission): string {
  const msg = item.data.message ?? '';
  const meta = item.data.metadata as
    | { source?: string; advisor_type?: string }
    | undefined;
  if (meta?.source === 'supabase-advisor') {
    const m = msg.match(
      /Table\s+\\?[`"]?([\w.]+)\\?[`"]?.*role\s+\\?[`"]?([\w_]+)\\?[`"]?/,
    );
    if (m) return `${meta.advisor_type}: ${m[1]} · ${m[2]}`;
    return meta.advisor_type ?? msg;
  }
  if (item.data.service === 'github-actions') {
    return msg.replace(/^Run failure:\s*/, '');
  }
  return msg.replace(/^\[[^\]]+\]\s*/, '');
}

function impactScore(e: ApiErrorSubmission): number {
  const firstSeen = new Date(e.submitted_at).getTime();
  const lastSeen = new Date(e.last_seen_at).getTime();
  const daysActive = Math.max(1, Math.min(30, (lastSeen - firstSeen) / 86400_000));
  return e.occurrence_count * daysActive;
}

export function ApiErrorsKanban({
  errors,
  dailySeries,
  onCopyPrompt,
  onForward,
  onStatusChange,
  forwardingIds,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const seriesBySubmission = useMemo(() => {
    const map: Record<string, ApiErrorDailyRow[]> = {};
    for (const r of dailySeries) (map[r.submission_id] ??= []).push(r);
    return map;
  }, [dailySeries]);

  const grouped = useMemo(() => {
    const map: Record<KanbanStatus, ApiErrorSubmission[]> = {
      new: [],
      under_review: [],
      planned: [],
      in_progress: [],
      done: [],
    };
    for (const e of errors) {
      const s = (e.feedback_status || 'new') as KanbanStatus;
      if (map[s]) map[s].push(e);
      else map.new.push(e);
    }
    for (const col of kanbanColumns) {
      map[col.id].sort((a, b) => impactScore(b) - impactScore(a));
    }
    return map;
  }, [errors]);

  const idsByColumn = useMemo(() => {
    const out: Record<KanbanStatus, string[]> = {
      new: [],
      under_review: [],
      planned: [],
      in_progress: [],
      done: [],
    };
    for (const col of kanbanColumns) out[col.id] = grouped[col.id].map((e) => e.id);
    return out;
  }, [grouped]);

  if (errors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">No API errors recorded</p>
    );
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    let targetCol: KanbanStatus | null = null;
    if (overId.startsWith('col:')) {
      targetCol = overId.slice(4) as KanbanStatus;
    } else {
      for (const col of kanbanColumns) {
        if (idsByColumn[col.id].includes(overId)) {
          targetCol = col.id;
          break;
        }
      }
    }
    if (!targetCol) return;
    const sourceCol = kanbanColumns.find((c) =>
      idsByColumn[c.id].includes(String(active.id)),
    )?.id;
    if (sourceCol && sourceCol !== targetCol) {
      onStatusChange(String(active.id), targetCol);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
    >
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        style={{
          gridTemplateColumns: undefined,
        }}
      >
        <div className="contents xl:hidden" />
        {kanbanColumns.map((col) => (
          <Column
            key={col.id}
            col={col}
            items={grouped[col.id]}
            itemIds={idsByColumn[col.id]}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            seriesBySubmission={seriesBySubmission}
            onCopyPrompt={onCopyPrompt}
            onForward={onForward}
            onStatusChange={onStatusChange}
            forwardingIds={forwardingIds}
          />
        ))}
      </div>
    </DndContext>
  );
}

interface ColumnProps {
  col: (typeof kanbanColumns)[number];
  items: ApiErrorSubmission[];
  itemIds: string[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  seriesBySubmission: Record<string, ApiErrorDailyRow[]>;
  onCopyPrompt: (item: ApiErrorSubmission) => void;
  onForward: (id: string) => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  forwardingIds: Set<string>;
}

function Column({
  col,
  items,
  itemIds,
  expandedId,
  setExpandedId,
  seriesBySubmission,
  onCopyPrompt,
  onForward,
  onStatusChange,
  forwardingIds,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.id}` });

  return (
    <div ref={setNodeRef} data-col-id={col.id}>
      <div
        className="flex items-center gap-2 mb-3 pb-2 border-b-2"
        style={{ borderColor: col.color }}
      >
        <p className="text-sm font-bold">{col.label}</p>
        <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
          {items.length}
        </Badge>
      </div>

      <div
        className={cn(
          'flex flex-col gap-2 min-h-[120px] md:max-h-[calc(100vh-300px)] overflow-y-auto pr-1 p-1 rounded transition-colors',
          isOver ? 'bg-muted' : 'bg-transparent',
        )}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.length === 0 && (
            <div className="py-8 text-center border border-dashed border-border rounded text-muted-foreground text-xs">
              Drop here
            </div>
          )}
          {items.map((item) => (
            <SortableErrorCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              series={seriesBySubmission[item.id] ?? []}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onCopyPrompt={onCopyPrompt}
              onForward={onForward}
              onStatusChange={onStatusChange}
              isForwarding={forwardingIds.has(item.id)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

interface CardProps {
  item: ApiErrorSubmission;
  expanded: boolean;
  series: ApiErrorDailyRow[];
  onToggle: () => void;
  onCopyPrompt: (item: ApiErrorSubmission) => void;
  onForward: (id: string) => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  isForwarding: boolean;
}

function SortableErrorCard({
  item,
  expanded,
  series,
  onToggle,
  onCopyPrompt,
  onForward,
  onStatusChange,
  isForwarding,
}: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const color = SERVICE_COLORS[item.data.service] || '#888';
  const withClaude = !!item.github_issue_url && item.feedback_status !== 'done';
  const advisorMeta = item.data.metadata as
    | { source?: string; advisor_type?: string; severity?: string }
    | undefined;
  const isAdvisor = advisorMeta?.source === 'supabase-advisor';
  const severityColor =
    advisorMeta?.severity === 'ERROR'
      ? '#ef4444'
      : advisorMeta?.severity === 'WARN'
        ? '#f59e0b'
        : '#6b7280';

  return (
    <div ref={setNodeRef} style={style}>
      <div className="p-2.5 border border-border bg-background rounded flex gap-1.5 hover:border-primary">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground/60 flex items-start pt-1 active:cursor-grabbing hover:text-muted-foreground"
          aria-label="Drag to reorder"
        >
          <GripVertical style={{ width: 14, height: 14 }} />
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-1 mb-1 flex-wrap">
            <Badge
              variant="outline"
              style={{
                borderColor: color,
                color,
                fontSize: '0.7rem',
                padding: '2px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {isAdvisor ? (
                <ShieldAlert style={{ width: 11, height: 11 }} />
              ) : (
                <Server style={{ width: 11, height: 11 }} />
              )}
              {isAdvisor ? `advisor · ${advisorMeta?.advisor_type}` : item.data.service}
            </Badge>
            {isAdvisor && advisorMeta?.severity && (
              <Badge
                variant="outline"
                style={{
                  borderColor: severityColor,
                  backgroundColor: severityColor,
                  color: '#fff',
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  fontWeight: 700,
                }}
              >
                {advisorMeta.severity}
              </Badge>
            )}
            {withClaude && (
              <Badge
                variant="outline"
                style={{
                  borderColor: '#8b5cf6',
                  backgroundColor: '#8b5cf6',
                  color: '#fff',
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 700,
                }}
              >
                <Github style={{ width: 11, height: 11 }} />#{item.github_issue_number}
              </Badge>
            )}
            <div className="flex-1" />
            <div className="opacity-80">
              <SparklineCell
                data={toDailySeries(series, 14)}
                color={color}
                width={56}
                height={16}
              />
            </div>
            <Badge
              variant="secondary"
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Hash style={{ width: 11, height: 11 }} />
              {item.occurrence_count}×
            </Badge>
          </div>

          <p
            className="font-semibold mb-0.5 break-words overflow-hidden"
            style={{
              fontSize: '0.85rem',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {extractTitle(item)}
          </p>

          <p className="text-muted-foreground block" style={{ fontSize: '0.72rem' }}>
            <Zap
              style={{
                width: 11,
                height: 11,
                display: 'inline',
                verticalAlign: -2,
                marginRight: 3,
              }}
            />
            {item.data.function_name}
            {item.data.status_code ? ` · ${item.data.status_code}` : ''}
            {' · '}last seen {timeAgo(item.last_seen_at)}
          </p>

          <div className="flex gap-1.5 mt-2 flex-wrap">
            {item.github_issue_url ? (
              <Button
                variant="outline"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  window.open(item.github_issue_url!, '_blank');
                }}
                style={{
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  height: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Github style={{ width: 12, height: 12 }} /> #{item.github_issue_number}
              </Button>
            ) : (
              <Button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onForward(item.id);
                }}
                disabled={isForwarding}
                style={{
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  height: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: 'hsl(var(--foreground))',
                  color: '#fff',
                }}
              >
                <MessageSquarePlus style={{ width: 12, height: 12 }} />
                {isForwarding ? 'Forwarding…' : 'Fix with Claude'}
              </Button>
            )}
            {item.feedback_status !== 'done' && (
              <Button
                variant="outline"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onStatusChange(item.id, 'done');
                }}
                style={{
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  height: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Mark resolved (auto-reopens if it recurs)"
              >
                <Check style={{ width: 12, height: 12 }} /> Resolve
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCopyPrompt(item);
              }}
              style={{
                fontSize: '0.72rem',
                padding: '4px 8px',
                height: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Copy Claude prompt"
            >
              <Copy style={{ width: 12, height: 12 }} />
            </Button>
          </div>

          <Collapsible open={expanded}>
            <CollapsibleContent>
              {item.data.stack && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-semibold block mb-1">Stack trace</p>
                  <div
                    className="p-2 bg-muted font-mono overflow-y-auto whitespace-pre-wrap break-all"
                    style={{ fontSize: '0.7rem', maxHeight: 200 }}
                  >
                    {item.data.stack}
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
