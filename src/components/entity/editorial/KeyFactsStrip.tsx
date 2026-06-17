import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface KeyFact {
  label: string;
  value: ReactNode;
}

export interface KeyFactsStripProps {
  facts: KeyFact[];
  className?: string;
}

export function KeyFactsStrip({ facts, className }: KeyFactsStripProps) {
  const populated = facts.filter((f) => f.value !== null && f.value !== undefined && f.value !== '');
  if (populated.length === 0) return null;

  return (
    <div className={cn('glass-shell', className)}>
      <dl className="glass-core grid grid-cols-2 divide-x divide-y divide-white/8 sm:grid-cols-3 md:grid-cols-6 md:divide-y-0">
        {populated.map((fact, i) => (
          <div key={i} className="flex flex-col gap-2 px-6 py-6">
            <dt className="text-2xs uppercase tracking-[0.14em] text-white/45">{fact.label}</dt>
            <dd className="font-display text-headline font-semibold leading-tight text-white">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
