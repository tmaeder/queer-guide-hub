import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Badge } from '@/components/ui/badge';
import { Inbox, Eye, Calendar, Activity, CheckCircle2 } from 'lucide-react';
import { FeedbackCard } from './FeedbackCard';
import { kanbanColumns, type KanbanStatus } from './constants';
import type { AdminProfile, FeedbackSubmission } from './types';

const COLUMN_EMPTY: Record<KanbanStatus, { icon: typeof Inbox; copy: string }> = {
  new: { icon: Inbox, copy: 'Nothing new to triage' },
  under_review: { icon: Eye, copy: 'Nothing under review' },
  planned: { icon: Calendar, copy: 'Nothing planned yet' },
  in_progress: { icon: Activity, copy: 'Nothing in progress' },
  done: { icon: CheckCircle2, copy: 'Nothing resolved recently' },
};

interface Props {
  grouped: Record<KanbanStatus, FeedbackSubmission[]>;
  voteCounts: Record<string, { count: number }>;
  selectedIds: Set<string>;
  focusedId: string | null;
  watchersByItem: Record<string, AdminProfile[]>;
  adminById: Record<string, AdminProfile>;
  isNew: (id: string, submittedAt: string) => boolean;
  onCardClick: (item: FeedbackSubmission) => void;
  onToggleSelect: (id: string, shift: boolean) => void;
  onStatusDrop: (id: string, status: KanbanStatus) => void;
}

export function FeedbackKanban({
  grouped,
  voteCounts,
  selectedIds,
  focusedId,
  watchersByItem,
  adminById,
  isNew,
  onCardClick,
  onToggleSelect,
  onStatusDrop,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const allIds = useMemo(() => {
    const out: Record<KanbanStatus, string[]> = {
      new: [],
      under_review: [],
      planned: [],
      in_progress: [],
      done: [],
    };
    for (const col of kanbanColumns) {
      out[col.id] = grouped[col.id].map((i) => i.id);
    }
    return out;
  }, [grouped]);

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    // Column droppables have id prefixed with "col:"
    let targetCol: KanbanStatus | null = null;
    if (overId.startsWith('col:')) {
      targetCol = overId.slice(4) as KanbanStatus;
    } else {
      for (const col of kanbanColumns) {
        if (allIds[col.id].includes(overId)) {
          targetCol = col.id;
          break;
        }
      }
    }
    if (!targetCol) return;
    const sourceCol = kanbanColumns.find((c) => allIds[c.id].includes(String(active.id)))?.id;
    if (sourceCol && sourceCol !== targetCol) {
      onStatusDrop(String(active.id), targetCol);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
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
            itemIds={allIds[col.id]}
            activeId={activeId}
            voteCounts={voteCounts}
            selectedIds={selectedIds}
            focusedId={focusedId}
            watchersByItem={watchersByItem}
            adminById={adminById}
            isNew={isNew}
            onCardClick={onCardClick}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </Box>
    </DndContext>
  );
}

interface ColumnProps {
  col: (typeof kanbanColumns)[number];
  items: FeedbackSubmission[];
  itemIds: string[];
  activeId: string | null;
  voteCounts: Record<string, { count: number }>;
  selectedIds: Set<string>;
  focusedId: string | null;
  watchersByItem: Record<string, AdminProfile[]>;
  adminById: Record<string, AdminProfile>;
  isNew: (id: string, submittedAt: string) => boolean;
  onCardClick: (item: FeedbackSubmission) => void;
  onToggleSelect: (id: string, shift: boolean) => void;
}

function Column({
  col,
  items,
  itemIds,
  activeId,
  voteCounts,
  selectedIds,
  focusedId,
  watchersByItem,
  adminById,
  isNew,
  onCardClick,
  onToggleSelect,
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
          px: 1,
          py: 0.75,
          borderTop: 3,
          borderColor: col.color,
          // Subtle 10%-alpha tint of the column color so each column is
          // recognisable at a glance, including while dragging.
          bgcolor: `color-mix(in srgb, ${col.color} 9%, transparent)`,
          borderRadius: '0 0 4px 4px',
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 700, color: col.color, letterSpacing: 0.3 }}
        >
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
          bgcolor:
            isOver && activeId
              ? `color-mix(in srgb, ${col.color} 14%, transparent)`
              : 'transparent',
          transition: 'background-color 0.15s',
        }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.length === 0 && (() => {
            const { icon: EmptyIcon, copy } = COLUMN_EMPTY[col.id];
            return (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.75,
                  py: 4,
                  opacity: 0.55,
                }}
              >
                <EmptyIcon size={22} color={col.color} strokeWidth={1.5} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {copy}
                </Typography>
              </Box>
            );
          })()}
          {items.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              voteCount={voteCounts[item.id]?.count ?? 0}
              selected={selectedIds.has(item.id)}
              focused={focusedId === item.id}
              watchers={watchersByItem[item.id] ?? []}
              assignee={item.assignee_id ? adminById[item.assignee_id] ?? null : null}
              isNew={isNew(item.id, item.submitted_at)}
              onClick={() => onCardClick(item)}
              onToggleSelect={(e) => {
                e.stopPropagation();
                onToggleSelect(item.id, e.shiftKey);
              }}
            />
          ))}
        </SortableContext>
      </Box>
    </Box>
  );
}
