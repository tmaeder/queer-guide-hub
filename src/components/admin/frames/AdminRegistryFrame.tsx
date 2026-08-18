import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

export interface RegistryRow {
  id: string;
  /** The rule's own name — a slug, a token key, a template id. */
  name: React.ReactNode;
  /** One line of what it does. */
  description?: React.ReactNode;
  /** The state toggle. The archetype's defining control. */
  toggle?: React.ReactNode;
  /** How often it has fired. The archetype's defining number. */
  firedCount?: React.ReactNode;
  /** When it last ran / next runs. */
  meta?: React.ReactNode;
  /** Row-level actions. */
  actions?: React.ReactNode;
  /**
   * Something needs attention. Renders as WEIGHT plus a written status, never
   * as colour alone — see the note on colour below.
   */
  alert?: boolean;
}

interface AdminRegistryFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  rows: RegistryRow[];
  /** Rendered when `rows` is empty — pass `<AdminEmpty noun="…" />`. */
  empty?: React.ReactNode;
  className?: string;
}

/**
 * Archetype H — Registry.
 *
 * *"Named rules or tokens with a state toggle and a fired-count."*
 *
 * `/admin/automation` is the textbook case and the reference this was built
 * against: a slug, an `enabled` toggle, a last-run status and a next-fire
 * time — the definition almost word for word.
 *
 * **Rows separate by hairline, not by frame.** A registry is a dense list, and
 * dense list rows are the one place the design system still allows a line
 * between surfaces (Brand Guidelines §02b: "Dense tables may divide rows at
 * 7–13% ink. That is the only line allowed between surfaces."). The rows are
 * not cards and must not grow shadows.
 *
 * **`alert` is weight, never colour.** The mock colours a flagged row's status
 * pill magenta, but CLAUDE.md holds in two locked places that a track colour
 * may never encode a state, and admin is not a good enough reason to erode a
 * rule the public safety surfaces depend on. A row that needs attention gets
 * emphasis and a written status; `--destructive` remains available to the
 * caller for genuine failure, since red is the one hue that does mean
 * something.
 */
export function AdminRegistryFrame({
  title,
  routeLine,
  filters,
  actions,
  rows,
  empty,
  className,
}: AdminRegistryFrameProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <AdminArchetypeHeader
        title={title}
        routeLine={routeLine}
        filters={filters}
        actions={actions}
      />

      <div className="px-6 pb-6">
        {rows.length === 0
          ? empty
          : rows.map((row) => (
              <div
                key={row.id}
                data-registry-row={row.id}
                className={cn(
                  'grid grid-cols-1 items-center gap-4 border-b border-border-hairline py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]',
                  row.alert && 'font-bold',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-15 font-bold">{row.name}</div>
                  {row.description && (
                    <div className="mt-1 text-13 font-normal leading-relaxed text-muted-foreground">
                      {row.description}
                    </div>
                  )}
                  {row.meta && (
                    <div className="mt-1 text-13 font-normal text-muted-foreground">{row.meta}</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-4">
                  {row.firedCount != null && (
                    <span className="text-13 font-bold tabular-nums">{row.firedCount}</span>
                  )}
                  {row.toggle}
                  {row.actions}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
