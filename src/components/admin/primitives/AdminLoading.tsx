
import { Skeleton } from '@/components/ui/skeleton';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { cn } from '@/lib/utils';

/**
 * Loading affordances for the admin console.
 *
 * The rule, which admin had never applied consistently: a **skeleton** on first
 * load (nothing on screen yet, so show the shape that is coming), a **spinner**
 * only when refetching over content that is already rendered, and never bare
 * "Loading..." text — it collapses the layout and reads as a stuck page.
 */

/** Rows-and-columns placeholder for a table that has not loaded yet. */
export function AdminTableSkeleton({
  rows = 5,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('p-4', className)} role="status" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-border py-4">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-5" style={{ width: j === 0 ? 180 : 100 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton rows for a <tbody>.
 *
 * A div-based skeleton is invalid HTML inside <table> and gets hoisted out by
 * the parser, so the seven pipeline-builder tables that rendered
 * `<tr><td colSpan={n}>Loading…</td></tr>` need this shape specifically.
 */
export function AdminTableRowSkeleton({
  columns,
  rows = 3,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="p-4">
              <Skeleton className="h-4" style={{ width: c === 0 ? '70%' : '45%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Bare stack of text-line placeholders, no border or heading.
 *
 * For first-load INSIDE a container that already draws its own chrome — a
 * <Card> body, a panel section. AdminCardSkeleton would nest a border in a
 * border there; this is the shape those ~25 `<p>Loading…</p>` sites needed.
 */
export function AdminTextSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

/** Heading-plus-body placeholder for a card or panel. */
export function AdminCardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-container border border-border p-6', className)}
      role="status"
      aria-label="Loading"
    >
      <Skeleton className="mb-4 h-6 w-48" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Small spinner for refetches over already-rendered content. Never use this as
 * a first-load state — reach for a skeleton so the layout does not jump.
 */
export function AdminInlineSpinner({
  className,
  label = 'Refreshing',
}: {
  className?: string;
  label?: string;
}) {
  // className and label are part of this component's API — the codemod that
  // swapped the spinner dropped both, which silently disabled every caller's
  // positioning and its screen-reader announcement.
  return <TrackLoader size={14} label={label} className={className} />;
}
