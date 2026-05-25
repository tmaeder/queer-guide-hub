import { cn } from '@/lib/utils';
import {
  COMMUNITY_DOMAINS,
  DOMAIN_LABELS,
  type CommunityDomain,
} from '@/lib/score';

interface DomainBreakdownProps {
  breakdown: Partial<Record<CommunityDomain, number>>;
  className?: string;
}

/**
 * Horizontal bar showing per-domain Community Score contributions.
 * Monochrome — segments use different opacity levels rather than color.
 * Empty domains are dropped from the legend; if the user has no points
 * anywhere the component returns null.
 */
export function DomainBreakdown({ breakdown, className }: DomainBreakdownProps) {
  const entries = COMMUNITY_DOMAINS.map((d) => [d, breakdown[d] ?? 0] as const).filter(
    ([, pts]) => pts > 0,
  );
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (total <= 0) return null;

  return (
    <section
      className={cn('rounded-container border border-border bg-card p-4', className)}
      aria-label="Points by domain"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground">Where your points came from</h3>
        <span className="text-13 tabular-nums text-muted-foreground">{total} pts</span>
      </div>
      <div
        className="mb-3 flex h-2 w-full overflow-hidden rounded-badge border border-border"
        role="img"
        aria-label="Per-domain point distribution"
      >
        {entries.map(([d, pts], i) => {
          const width = (pts / total) * 100;
          // Alternate full-foreground and 60%-opacity slabs so segments are
          // distinguishable in monochrome without crossing the no-color rule.
          const tone = i % 2 === 0 ? 'bg-foreground' : 'bg-foreground/60';
          return (
            <div
              key={d}
              className={tone}
              style={{ width: `${width}%` }}
              title={`${DOMAIN_LABELS[d]}: ${pts} pts`}
            />
          );
        })}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-13">
        {entries.map(([d, pts]) => (
          <div key={d} className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground truncate">{DOMAIN_LABELS[d]}</dt>
            <dd className="tabular-nums text-foreground">{pts}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
