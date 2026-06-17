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
    <dl
      className={cn(
        'grid grid-cols-2 divide-y divide-x rounded-container border bg-background sm:grid-cols-3 md:grid-cols-6 md:divide-y-0',
        className,
      )}
    >
      {populated.map((fact, i) => (
        <div key={i} className="flex flex-col gap-2 px-6 py-4">
          <dt className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">{fact.label}</dt>
          <dd className="text-headline font-bold leading-tight text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
