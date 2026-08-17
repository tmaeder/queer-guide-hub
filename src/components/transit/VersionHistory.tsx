import { cn } from '@/lib/utils';

export interface Revision {
  id: string;
  /** ISO date; rendered absolute. */
  date: string;
  change: string;
  by?: string | null;
}

/**
 * Module 12 — "What changed and when, with old versions readable so past rules
 * stay visible." Required on Countries, Milestones, News, Pages and Tags.
 *
 * It owns four of the thirteen types, and the spec says why each needs it:
 * a country page is "a living legal record" where "safety information without
 * a date is dangerous"; a policy page is "versioned so riders can see what they
 * agreed to"; a news story shows corrections because "corrections are the
 * point"; a tag keeps "contested notes" because "nothing is deleted".
 *
 * Newest first, and NOTHING is collapsed behind a "show more" — the history is
 * the content on these types, not an appendix to it.
 */
export function VersionHistory({
  revisions,
  className,
}: {
  revisions: Revision[];
  className?: string;
}) {
  if (revisions.length === 0) return null;

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <ol className={cn('list-none bg-muted rounded-element p-0', className)}>
      {revisions.map((r) => (
        <li
          key={r.id}
          className="grid grid-cols-[110px_1fr] items-baseline gap-4 border-b border-foreground/15 px-4 py-4 last:border-b-0 sm:grid-cols-[130px_1fr_auto]"
        >
          <time dateTime={r.date} className="text-13 font-bold tabular-nums">
            {fmt(r.date)}
          </time>
          <span className="text-13 leading-relaxed">{r.change}</span>
          {r.by && <span className="text-13 font-bold text-muted-foreground">{r.by}</span>}
        </li>
      ))}
    </ol>
  );
}
