import { cn } from '@/lib/utils';

export interface Stat {
  label: string;
  value: React.ReactNode;
}

/**
 * Module 15 — "Counts that a rider can act on: seats left, riders going,
 * kilometres, price."
 *
 * The qualifier is the spec: a count belongs here only if it changes what the
 * reader DOES. Seats left changes whether you book now; a page-view total
 * changes nothing and is vanity. This module is deliberately dumb — it renders
 * what it is given — so the judgement lives at the call site, where the caller
 * can see whether the number is actionable.
 */
export function StatLine({ stats, className }: { stats: Stat[]; className?: string }) {
  const shown = stats.filter((s) => s.value !== null && s.value !== undefined && s.value !== '');
  if (shown.length === 0) return null;

  return (
    <dl className={cn('m-0', className)}>
      {shown.map((s) => (
        <div
          key={s.label}
          className="flex items-baseline justify-between gap-4 border-b border-foreground/15 py-2 last:border-b-0 last:pb-0"
        >
          <dt className="text-13 opacity-75">{s.label}</dt>
          <dd className="m-0 text-13 font-bold tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
