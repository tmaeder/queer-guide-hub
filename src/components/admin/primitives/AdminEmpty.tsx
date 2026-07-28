import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AdminEmptyProps {
  /**
   * Plural noun for the thing that is missing, lowercase — "venues", "pending
   * reviews". Renders as "No {noun} yet." per the house copy rule.
   */
  noun: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Primary action, e.g. a "New venue" button. Hidden while filtered. */
  action?: ReactNode;
  /** True when filters/search are active — the list is empty, the table isn't. */
  filtered?: boolean;
  onReset?: () => void;
  className?: string;
}

/**
 * Empty state for the admin console.
 *
 * Deliberately NOT `@/components/ui/EmptyState`: that one is a Card with a 72px
 * icon circle, `mood` props and useTranslation — the right register for a public
 * page, the wrong one for a dense console, and it would drag i18n into an
 * English-only tree. That mismatch is why it had zero admin consumers.
 *
 * Distinguishes "nothing exists yet" from "your filters matched nothing", which
 * the ~41 ad-hoc "No X found" strings across admin never did.
 */
export function AdminEmpty({
  noun,
  description,
  icon: Icon = Inbox,
  action,
  filtered = false,
  onReset,
  className,
}: AdminEmptyProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-8 py-16 text-center',
        className,
      )}
    >
      <Icon size={32} className="mb-4 text-muted-foreground" aria-hidden />
      <p className="text-15 font-medium text-foreground">
        {filtered ? `No ${noun} match these filters.` : `No ${noun} yet.`}
      </p>
      {(description || filtered) && (
        <p className="mt-1 max-w-md text-13 text-muted-foreground">
          {filtered ? 'Adjust the filters or clear them to see everything.' : description}
        </p>
      )}
      {filtered && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 text-13 font-medium text-foreground underline underline-offset-4"
        >
          Clear filters
        </button>
      )}
      {!filtered && action && <div className="mt-4">{action}</div>}
    </div>
  );
}
