/**
 * CockpitWidgetShell — sortable bento cell wrapping one widget body.
 * Header carries the widget icon + title and (in edit mode) a drag handle and
 * a per-widget menu (pin / hide). The body fetches its own data and renders
 * its own FreshnessIndicator.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreVertical, EyeOff, Pin, PinOff } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { WIDGET_SPAN, type CockpitWidgetDef, type WidgetRenderContext } from './types';

interface CockpitWidgetShellProps {
  def: CockpitWidgetDef;
  ctx: WidgetRenderContext;
  isEditing: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  onHide: () => void;
}

export function CockpitWidgetShell({
  def,
  ctx,
  isEditing,
  isPinned,
  onTogglePin,
  onHide,
}: CockpitWidgetShellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: def.id,
    disabled: !isEditing,
  });
  const span = WIDGET_SPAN[def.size];
  const Icon = def.icon;
  const Body = def.Body;

  return (
    <section
      ref={setNodeRef}
      style={{
        gridColumn: `span ${span} / span ${span}`,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'bg-background p-4 flex flex-col gap-4 min-h-[140px]',
        isDragging && 'z-10 opacity-80',
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={14} className="text-muted-foreground shrink-0" aria-hidden />
          <h3 className="text-xs font-medium uppercase tracking-label text-muted-foreground truncate">
            {def.title}
          </h3>
          {isPinned && !isEditing && (
            <Pin size={11} className="text-muted-foreground shrink-0" aria-label="Pinned" />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isEditing && (
            <button
              type="button"
              className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={14} aria-hidden />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`${def.title} options`}
              >
                <MoreVertical size={14} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onTogglePin}>
                {isPinned ? (
                  <>
                    <PinOff size={14} className="mr-2" aria-hidden /> Unpin
                  </>
                ) : (
                  <>
                    <Pin size={14} className="mr-2" aria-hidden /> Pin to top
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onHide}>
                <EyeOff size={14} className="mr-2" aria-hidden /> Hide widget
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="flex-1">
        <Body {...ctx} />
      </div>
    </section>
  );
}
