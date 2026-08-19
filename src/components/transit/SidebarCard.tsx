import { cn } from '@/lib/utils';

/**
 * The 3px-bordered sidebar block every entity single stacks down its right
 * column ("Singles Venue Event Tag.dc.html": Around this station / Tonight /
 * Provenance / Report).
 *
 * `tone="ink"` is the flooded variant the spec reserves for the report and
 * safety blocks — the one place a sidebar card inverts.
 */
export function SidebarCard({
  eyebrow,
  title,
  tone = 'paper',
  className,
  children,
}: {
  eyebrow?: string;
  title?: string;
  tone?: 'paper' | 'ink';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'bg-muted rounded-element p-4',
        tone === 'ink' && 'bg-foreground text-background',
        className,
      )}
    >
      {eyebrow && (
        <div
          className={cn(
            'text-2xs font-bold uppercase tracking-label',
            tone === 'ink' ? 'text-background/70' : 'text-muted-foreground',
          )}
        >
          {eyebrow}
        </div>
      )}
      {title && <h2 className="mt-1 text-title font-bold leading-tight">{title}</h2>}
      <div className={cn(eyebrow || title ? 'mt-2' : '')}>{children}</div>
    </section>
  );
}

/**
 * A label/value row inside a SidebarCard — the "Capacity 240 / Riders going 42
 * / Door €8 sliding" stack. Rules between rows, none after the last.
 */
export function SidebarRow({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 border-b border-border-hairline py-2 last:border-b-0 last:pb-0',
        className,
      )}
    >
      <span className="text-13 opacity-75">{label}</span>
      <span className="text-13 font-bold">{value}</span>
    </div>
  );
}
