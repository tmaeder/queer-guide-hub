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
}: {
  caption?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-[3px] border-foreground p-4', className)}>
      <div className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
        Around this station
      </div>
      <div className="mt-2 border-2 border-foreground">{children}</div>
      {caption && <p className="mt-2 text-13 leading-relaxed">{caption}</p>}
    </section>
  );
}
