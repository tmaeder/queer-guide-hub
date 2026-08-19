import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

export interface RegistryRowProps {
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
  actions?: React.ReactNode;
  /**
   * Something needs attention. Renders as WEIGHT plus whatever the caller
   * writes, never as colour alone — see the note on colour below.
   */
  alert?: boolean;
  className?: string;
}

/**
 * The simple registry row: name, fired-count, toggle.
 *
 * A convenience, not a requirement. A registry with more than three facts per
 * rule — `/admin/automation` carries seven, including schedule, next fire and
 * last-run status — is better served by a table, and `AdminRegistryFrame`
 * takes any body precisely so that stays possible.
 */
export function AdminRegistryRow({
  name,
  description,
  toggle,
  firedCount,
  meta,
  actions,
  alert,
  className,
}: RegistryRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 items-center gap-4 border-b border-border-hairline py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]',
        alert && 'font-bold',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-15 font-bold">{name}</div>
        {description && (
          <div className="mt-1 text-13 font-normal leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
        {meta && <div className="mt-1 text-13 font-normal text-muted-foreground">{meta}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-4">
        {firedCount != null && <span className="text-13 font-bold tabular-nums">{firedCount}</span>}
        {toggle}
        {actions}
      </div>
    </div>
  );
}

interface AdminRegistryFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  /** The registry body: `AdminRegistryRow`s, a table, whatever the data needs. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Archetype H — Registry.
 *
 * *"Named rules or tokens with a state toggle and a fired-count."*
 *
 * **The frame owns the chrome; the caller owns the body** — the same contract
 * as archetype A, and for the same reason. This shipped with a row shape baked
 * in, and the first real migration showed why that was wrong:
 * `/admin/automation` is the page H was modelled on, and it renders seven
 * columns (name, managed-by, schedule, next run, last run, status, actions)
 * with row-click to open a detail. Flattening that into name-plus-toggle would
 * have been a downgrade dressed as consistency — a schedule and a next-fire
 * time are exactly the things an operator scans down a column.
 *
 * So H constrains the *grammar*, not the markup: header, filter row, primary
 * action, and a body of named things with their state. `AdminRegistryRow` is
 * there for the registries that really are three facts wide.
 *
 * **Rows separate by hairline, never by shadow.** A registry is a dense list,
 * and dense list rows are the one place the design system still permits a line
 * between surfaces (Brand Guidelines §02b). They are not cards.
 *
 * **`alert` is weight, never colour.** The mock colours a flagged row's pill
 * magenta, but CLAUDE.md holds in two locked places that a track colour may
 * never encode a state, and an internal console is not a good enough reason to
 * erode a rule the public safety surfaces depend on. `--destructive` stays
 * available for genuine failure — red is the one hue that does mean something.
 */
export function AdminRegistryFrame({
  title,
  routeLine,
  filters,
  actions,
  children,
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
      <div className="min-w-0 overflow-x-auto pb-6">{children}</div>
    </div>
  );
}
