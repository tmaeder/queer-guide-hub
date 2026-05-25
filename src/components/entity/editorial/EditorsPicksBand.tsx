import type { ReactNode } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';

export interface EditorsPick {
  kicker: string;
  title: string;
  href: string;
  imageUrl?: string | null;
  rationale?: string;
  badge?: ReactNode;
}

export interface EditorsPicksBandProps {
  picks: EditorsPick[];
  className?: string;
}

export function EditorsPicksBand({ picks, className }: EditorsPicksBandProps) {
  if (picks.length === 0) return null;
  return (
    <section
      aria-label="Editor's picks"
      className={cn('grid grid-cols-1 gap-6 md:grid-cols-3', className)}
    >
      {picks.map((pick, i) => (
        <LocalizedLink
          key={i}
          to={pick.href}
          className="group flex flex-col overflow-hidden rounded-container border bg-background no-underline transition-opacity hover:opacity-90"
        >
          {pick.imageUrl ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
              <img
                src={pick.imageUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
              {pick.badge ? (
                <div className="absolute left-4 top-4 inline-flex items-center rounded-badge bg-background/90 px-2 py-1 text-2xs uppercase tracking-[0.14em] text-foreground">
                  {pick.badge}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-1 flex-col gap-2 p-6">
            <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              {pick.kicker}
            </p>
            <h3 className="text-title font-bold leading-tight text-foreground">{pick.title}</h3>
            {pick.rationale ? (
              <p className="text-13 leading-relaxed text-muted-foreground">{pick.rationale}</p>
            ) : null}
          </div>
        </LocalizedLink>
      ))}
    </section>
  );
}
