import { cn } from '@/lib/utils';

/**
 * Module 16 — "The bending line around this station, zoomed to walking
 * distance." Required on Countries, Cities and Queer Villages.
 *
 * A FRAME, not a second map implementation: it wraps whatever map the caller
 * already renders (`EntityMap`) in the module's border + caption so every
 * single presents geography identically. Building another map here would
 * fork tile loading, clustering and the safety-gating the existing one does.
 *
 * "Zoomed to walking distance" is the caller's job — the zoom belongs with
 * the data, and a city inset and a village inset want different scales.
 */
export function MapInset({
  caption,
  children,
  className,
  heading,
  action,
}: {
  caption?: string;
  children: React.ReactNode;
  className?: string;
  heading?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn('bg-muted rounded-element p-4', className)}>
      {heading || action ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <h2 className="text-title font-bold">{heading ?? 'Around this station'}</h2>
          {action}
        </div>
      ) : (
        <div className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          Around this station
        </div>
      )}
      <div className="mt-2 bg-muted rounded-element">{children}</div>
      {caption && <p className="mt-2 text-13 leading-relaxed">{caption}</p>}
    </section>
  );
}
