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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface Props {
  errors: ApiErrorSubmission[];
  dailySeries: ApiErrorDailyRow[];
  onCopyPrompt: (item: ApiErrorSubmission) => void;
  onForward: (id: string) => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  forwardingIds: Set<string>;
}

// Strip log prefixes / classify subject for readable card titles.
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

// Chronic errors float above one-off spikes.
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
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No API errors recorded
      </Typography>
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
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)',
            xl: `repeat(${kanbanColumns.length}, 1fr)`,
          },
          gap: 2,
        }}
      >
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
      </Box>
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
    <Box ref={setNodeRef} data-col-id={col.id}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
          pb: 1,
          borderBottom: 2,
          borderColor: col.color,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {col.label}
        </Typography>
        <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
          {items.length}
        </Badge>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          minHeight: 120,
          maxHeight: { md: 'calc(100vh - 300px)' },
          overflowY: 'auto',
          pr: 0.5,
          p: 0.5,
          borderRadius: 1,
          bgcolor: isOver ? 'action.hover' : 'transparent',
          transition: 'background-color 0.15s',
        }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.length === 0 && (
            <Box
              sx={{
                py: 4,
                textAlign: 'center',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                color: 'text.disabled',
                fontSize: '0.75rem',
              }}
            >
              Drop here
            </Box>
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
      </Box>
    </Box>
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
      <Box
        sx={{
          p: 1.25,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          borderRadius: 1,
          display: 'flex',
          gap: 0.75,
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        <Box
          {...attributes}
          {...listeners}
          sx={{
            cursor: 'grab',
            color: 'text.disabled',
            display: 'flex',
            alignItems: 'flex-start',
            pt: 0.5,
            '&:active': { cursor: 'grabbing' },
            '&:hover': { color: 'text.secondary' },
          }}
          aria-label="Drag to reorder"
        >
          <GripVertical style={{ width: 14, height: 14 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onToggle}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mb: 0.5,
              flexWrap: 'wrap',
            }}
          >
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
            <Box sx={{ flex: 1 }} />
            <Box sx={{ opacity: 0.8 }}>
              <SparklineCell
                data={toDailySeries(series, 14)}
                color={color}
                width={56}
                height={16}
              />
            </Box>
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
          </Box>

          <Typography
            sx={{
              fontWeight: 600,
              fontSize: '0.85rem',
              lineHeight: 1.35,
              mb: 0.25,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {extractTitle(item)}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.72rem', display: 'block' }}
          >
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
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
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
                  backgroundColor: 'hsl(var(--accent-warm))',
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
          </Box>

          <Collapse in={expanded}>
            {item.data.stack && (
              <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                >
                  Stack trace
                </Typography>
                <Box
                  sx={{
                    p: 1,
                    bgcolor: 'action.hover',
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    maxHeight: 200,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {item.data.stack}
                </Box>
              </Box>
            )}
          </Collapse>
        </Box>
      </Box>
    </div>
  );
}
