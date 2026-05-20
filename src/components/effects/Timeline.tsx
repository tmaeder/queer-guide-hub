import * as React from 'react';
import { cn } from '@/lib/utils';

interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

interface TimelineProps {
  data: TimelineEntry[];
  className?: string;
}

/**
 * Aceternity Timeline — gutted 2026-05-19. Scroll-driven beam removed;
 * renders a static vertical list with hairline left border.
 */
export function Timeline({ data, className }: TimelineProps) {
  return (
    <div className={cn('relative mx-auto max-w-4xl px-4 md:px-8', className)}>
      <div className="relative border-l border-border pl-6 md:pl-10 space-y-12 md:space-y-16">
        {data.map((entry, i) => (
          <section key={`${entry.title}-${i}`} className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[7px] md:-left-[11px] top-1.5 h-3 w-3 rounded-full bg-foreground"
            />
            <h3 className="text-lg md:text-xl font-semibold tracking-tight">{entry.title}</h3>
            <div className="mt-3 text-muted-foreground">{entry.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
