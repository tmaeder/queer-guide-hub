import * as React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';

export type EntitySpan = 'sm' | 'md' | 'lg' | 'wide' | 'tall';

interface EntityCardProps {
  href: string;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  image?: string | null;
  imageAlt?: string;
  span?: EntitySpan;
  overlay?: boolean;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

const SPAN_CLASSES: Record<EntitySpan, string> = {
  sm: 'col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3',
  md: 'col-span-12 sm:col-span-6 md:col-span-4',
  lg: 'col-span-12 sm:col-span-6 md:col-span-6',
  wide: 'col-span-12 md:col-span-8',
  tall: 'col-span-12 sm:col-span-6 md:col-span-4 row-span-2',
};

const ASPECT_BY_SPAN: Record<EntitySpan, string> = {
  sm: 'aspect-[4/5]',
  md: 'aspect-[4/5]',
  lg: 'aspect-[16/10]',
  wide: 'aspect-[16/9]',
  tall: 'aspect-[3/4] md:aspect-auto md:h-full',
};

export function EntityCard({
  href,
  title,
  eyebrow,
  meta,
  image,
  imageAlt = '',
  span = 'sm',
  overlay = false,
  badges,
  actions,
  className,
  children,
}: EntityCardProps) {
  return (
    <LocalizedLink
      to={href}
      className={cn(
        SPAN_CLASSES[span],
        'group relative isolate flex flex-col overflow-hidden rounded-2xl border border-border bg-background no-underline transition-colors duration-300 hover:border-foreground/40',
        className,
      )}
    >
      <div className={cn('relative w-full overflow-hidden bg-muted', ASPECT_BY_SPAN[span])}>
        {image ? (
          <img
            src={image}
            alt={imageAlt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover grayscale-[0.15] transition-all duration-500 ease-out group-hover:grayscale-0 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}

        {overlay && image && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
          />
        )}

        {badges && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1">{badges}</div>
        )}
        {actions && (
          <div className="absolute right-2 top-2 flex items-center gap-1">{actions}</div>
        )}

        {overlay && (
          <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-background">
            {eyebrow && (
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-80">
                {eyebrow}
              </div>
            )}
            <h3 className="mt-1 text-lg md:text-xl font-extrabold tracking-tight leading-tight">
              {title}
            </h3>
            {meta && <div className="mt-1 text-xs opacity-80 tabular-nums">{meta}</div>}
          </div>
        )}
      </div>

      {!overlay && (
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          {eyebrow && (
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <h3 className="text-lg font-extrabold tracking-tight leading-tight text-foreground">
            {title}
          </h3>
          {meta && (
            <div className="text-xs text-muted-foreground tabular-nums">{meta}</div>
          )}
          {children}
        </div>
      )}

      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px w-0 bg-foreground transition-[width] duration-500 ease-out group-hover:w-full"
      />
    </LocalizedLink>
  );
}
