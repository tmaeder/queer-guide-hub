import type { ComponentType, ReactNode } from 'react';
import { ArrowUpRight } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Compact affiliate card for the "book the rest of it" shelf (car rental,
 * transfer, insurance). Vertical so three fit side by side; the whole card is
 * the outbound link.
 */
export function TravelLinkCard({
  icon: Icon,
  title,
  note,
  cta,
  href,
  warn,
}: {
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  note?: ReactNode;
  cta: string;
  href: string;
  /** Safety-relevant recommendation: keeps the warning tint. */
  warn?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={cn(
        'card-lift flex h-full flex-col gap-2 rounded-container p-4 text-foreground no-underline shadow-soft',
        !warn && 'bg-card',
      )}
      style={warn ? { backgroundColor: 'hsl(var(--warning) / 0.15)' } : undefined}
    >
      <span aria-hidden className="grid size-10 place-items-center rounded-full bg-muted">
        <Icon size={20} aria-hidden />
      </span>
      <span className="text-15 font-bold leading-tight">{title}</span>
      {note && <span className="text-13 text-muted-foreground">{note}</span>}
      <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-13 font-bold">
        {cta}
        <ArrowUpRight size={16} aria-hidden />
      </span>
    </a>
  );
}
