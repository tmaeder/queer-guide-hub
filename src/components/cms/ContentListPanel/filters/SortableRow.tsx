import type { ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/**
 * Drag-to-reorder for the property and sort lists.
 *
 * Layered ON TOP of the up/down buttons, which stay the accessible contract and
 * are what the tests drive. Drag is an affordance; remove it and both lists
 * still work completely by keyboard.
 *
 * dnd-kit is already a dependency and already in the admin bundle
 * (FeedbackKanban), so this adds nothing to the public build.
 */

interface ListProps {
  ids: string[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}

export function DragReorderList({ ids, onReorder, children }: ListProps) {
  const sensors = useSensors(
    // A small distance so a click on a switch inside the row is not read as a
    // drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

interface RowProps {
  id: string;
  /** Named in the handle's accessible label. */
  label: string;
  children: ReactNode;
}

export function DragReorderRow({ id, label, children }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 ${isDragging ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        // The handle carries the drag listeners so the rest of the row stays
        // clickable — switches and buttons inside must keep working.
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${label}`}
        className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground"
      >
        <GripVertical size={14} />
      </button>
      {children}
    </div>
  );
}
