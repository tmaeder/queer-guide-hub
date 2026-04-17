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
          gridTemplateColumns: { xs: '1fr', md: `repeat(${kanbanColumns.length}, 1fr)` },
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
        <Badge variant="secondary" style={{ fontSize: '0.65rem' }}>
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
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ py: 3, textAlign: 'center' }}
            >
              No items
            </Typography>
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
  // Supabase-advisor rows carry type + severity in metadata; render a
  // Shield icon + severity-tinted chip so they visually separate from
  // runtime errors even at a glance.
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Box
        onClick={onToggle}
        sx={{
          p: 1,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          borderRadius: 1,
          cursor: 'pointer',
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
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
              fontSize: '0.55rem',
              padding: '1px 4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {isAdvisor ? (
              <ShieldAlert style={{ width: 8, height: 8 }} />
            ) : (
              <Server style={{ width: 8, height: 8 }} />
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
                fontSize: '0.55rem',
                padding: '1px 4px',
                fontWeight: 700,
              }}
            >
              {advisorMeta.severity}
            </Badge>
          )}
          <Badge
            variant="outline"
            style={{
              fontSize: '0.55rem',
              padding: '1px 4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Zap style={{ width: 8, height: 8 }} />
            {item.data.function_name}
          </Badge>
          {withClaude && (
            <Badge
              variant="outline"
              style={{
                borderColor: '#8b5cf6',
                backgroundColor: '#8b5cf6',
                color: '#fff',
                fontSize: '0.55rem',
                padding: '1px 4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                fontWeight: 700,
              }}
            >
              <Github style={{ width: 8, height: 8 }} />
              Claude · #{item.github_issue_number}
            </Badge>
          )}
          <Box sx={{ flex: 1 }} />
          <Box sx={{ opacity: 0.8 }}>
            <SparklineCell data={toDailySeries(series, 14)} color={color} width={60} height={18} />
          </Box>
          <Badge
            variant="secondary"
            style={{
              fontSize: '0.55rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Hash style={{ width: 8, height: 8 }} />
            {item.occurrence_count}x
          </Badge>
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.data.message}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
          Last seen {timeAgo(item.last_seen_at)}
          {item.data.status_code ? ` · ${item.data.status_code}` : ''}
        </Typography>

        <Collapse in={expanded}>
          <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            {item.data.stack && (
              <Box sx={{ mb: 1 }}>
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
                    fontSize: '0.6rem',
                    maxHeight: 160,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {item.data.stack}
                </Box>
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onCopyPrompt(item);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Copy style={{ width: 12, height: 12 }} /> Copy Prompt
              </Button>
              {item.feedback_status !== 'done' && (
                <Button
                  variant="outline"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onStatusChange(item.id, 'done');
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  title="Mark resolved (auto-reopens if it recurs)"
                >
                  <Check style={{ width: 12, height: 12 }} /> Resolve
                </Button>
              )}
              {item.github_issue_url ? (
                <Button
                  variant="outline"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    window.open(item.github_issue_url!, '_blank');
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: 'hsl(var(--accent-warm))',
                    color: '#fff',
                  }}
                >
                  <MessageSquarePlus style={{ width: 12, height: 12 }} />
                  {isForwarding ? 'Forwarding…' : 'Fix with Claude'}
                </Button>
              )}
            </Box>
          </Box>
        </Collapse>
      </Box>
    </div>
  );
}
