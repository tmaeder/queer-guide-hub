/**
 * CockpitGrid — the role-adaptive, reorderable widget grid.
 * Renders visible widgets (pinned first) into a 12-col bento grid. In edit mode,
 * widgets can be dragged to reorder; drops persist via onReorder. Keyboard sensor
 * + the per-widget menu provide the a11y path.
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CockpitWidgetShell } from './CockpitWidgetShell';
import type { CockpitWidgetDef, WidgetRenderContext } from './types';

interface CockpitGridProps {
  /** Visible widgets in resolved display order (pinned first). */
  widgets: CockpitWidgetDef[];
  ctx: WidgetRenderContext;
  isEditing: boolean;
  pinnedIds: string[];
  onReorder: (orderedIds: string[]) => void;
  onTogglePin: (id: string) => void;
  onHide: (id: string) => void;
}

export function CockpitGrid({
  widgets,
  ctx,
  isEditing,
  pinnedIds,
  onReorder,
  onTogglePin,
  onHide,
}: CockpitGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = widgets.map((w) => w.id);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-12 auto-rows-min gap-px bg-border">
          {widgets.map((def) => (
            <CockpitWidgetShell
              key={def.id}
              def={def}
              ctx={ctx}
              isEditing={isEditing}
              isPinned={pinnedIds.includes(def.id)}
              onTogglePin={() => onTogglePin(def.id)}
              onHide={() => onHide(def.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
