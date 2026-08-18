import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

interface AdminTreeCanvasFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  /** Column 1 — the hierarchy, or a layer/filter panel. */
  tree: React.ReactNode;
  /** Column 2 — map, graph or node canvas. */
  canvas: React.ReactNode;
  className?: string;
}

/**
 * Archetype G — Tree + canvas.
 *
 * *"Hierarchy on the left, spatial or graph view on the right."* Mock layout:
 * `320px 1fr`.
 *
 * **The canvas column must NOT be clipped.** Wrapping it in a rounded card
 * needs `overflow:hidden` to cut the corner, and that clip kills drag-to-edge
 * panning on the pipeline builder and cuts nodes off at the boundary. The
 * canvas gets the frame's spacing and nothing else; if a surface wants a
 * rounded edge it draws one inside its own viewport.
 *
 * `/admin/maps` reaches this frame by promoting `MapShell`'s existing
 * layer/filter panel into the tree column. **`MapShell` itself is not
 * modified** — it is shared with the public `/map`, so an admin-shaped change
 * there leaks straight onto a user-facing surface.
 */
export function AdminTreeCanvasFrame({
  title,
  routeLine,
  filters,
  actions,
  tree,
  canvas,
  className,
}: AdminTreeCanvasFrameProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <AdminArchetypeHeader
        title={title}
        routeLine={routeLine}
        filters={filters}
        actions={actions}
      />
      <div className="grid min-w-0 gap-6 pb-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 overflow-y-auto">{tree}</div>
        {/* No overflow-hidden, no radius: see the note above. */}
        <div className="min-w-0">{canvas}</div>
      </div>
    </div>
  );
}
