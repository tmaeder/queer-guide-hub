import * as React from 'react';
import { useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { getArchetypeRouteLine } from '@/config/adminArchetypes';

interface AdminArchetypeHeaderProps {
  /** Anton title. The only required part of the grammar. */
  title: React.ReactNode;
  /**
   * Overrides the derived `B · RECORD EDITOR — /admin/...` line. Pass a string
   * for a record whose identity is not in the URL; pass `null` to suppress it
   * on an exempt route.
   */
  routeLine?: string | null;
  /**
   * The filter row. Part of the header grammar, not a sibling of it — the
   * design document lists it alongside the title and the primary action, and
   * every archetype that filters puts it in the same place.
   */
  filters?: React.ReactNode;
  /** Right-aligned button cluster. Primary action last, as in the mocks. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The fixed header grammar shared by all eight admin archetypes.
 *
 * `Admin Archetypes.dc.html`: *"one shell and eight content archetypes, each
 * with a fixed header grammar: route line, title, filter row, primary
 * action."* Every admin page emits exactly this block, so a reader who learns
 * one console has learned forty.
 *
 * **The route line is derived, not typed.** It reads the archetype registry,
 * so it cannot drift from the frame the page actually renders in, and an
 * unregistered route simply gets no line rather than a wrong one.
 *
 * Vertical padding only: AdminShell's <main> is documented as "the ONE owner
 * of admin page spacing" and already applies PAGE_GUTTER, so a frame that
 * added its own px would double-pad every admin page — the exact defect that
 * rule was written to end.
 *
 * py-4 (16), not the mock's 14: the 8pt-grid rule rejects py-3 and py-3.5
 * alike, and 2px is not worth a suppression in the one component every admin
 * page renders.
 */
export function AdminArchetypeHeader({
  title,
  routeLine,
  filters,
  actions,
  className,
}: AdminArchetypeHeaderProps) {
  const location = useLocation();
  const line = routeLine === undefined ? getArchetypeRouteLine(location.pathname) : routeLine;

  return (
    <header
      className={cn(
        'flex flex-col gap-4 py-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {line && (
          // Not an <Eyebrow>: this is a machine-derived locator, not editorial
          // copy, and it is deliberately the dimmest thing in the header.
          <p className="m-0 truncate text-xs2 font-bold uppercase tracking-label text-muted-foreground">
            {line}
          </p>
        )}
        <h1 className="m-0 mt-1 font-display text-headline leading-tight">{title}</h1>
        {filters && <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
