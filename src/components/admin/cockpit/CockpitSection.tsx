/**
 * CockpitSection — the shared chrome for one block of the cockpit feed:
 * an eyebrow heading, an optional right-aligned meta slot, and the body.
 *
 * Deliberately not a Card. The feed reads top-to-bottom as one column at every
 * width, and boxing each section would reintroduce the bento look this replaced.
 */

import type { ReactNode } from 'react';

export function CockpitSection({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`cockpit-${id}-heading`} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id={`cockpit-${id}-heading`}
          className="text-2xs font-medium uppercase tracking-label text-muted-foreground"
        >
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}

/** Hairline-separated list container shared by the queue and broken lists. */
export function CockpitList({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col divide-y divide-border rounded-container border border-border">
      {children}
    </div>
  );
}
