import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * The action row shared by venue, event and news singles: ONE primary verb,
 * one compact save + share group, and every rare action behind a single
 * overflow menu. The three pages each grew their own row (venue: trip, heart,
 * share, flag; event: tickets, trip, heart, share, "More options"; news:
 * heart, flag, share, source) with no shared order or styling.
 *
 * The overflow is a `<details>` rather than a Radix dropdown on purpose: its
 * items (report, add to trip, check-in) each own a dialog, and a dropdown
 * unmounts its content on close — taking the dialog it just opened with it.
 * A closed `<details>` keeps its children mounted.
 */
export function DetailActionBar({
  primary,
  save,
  share,
  more,
  admin,
  className,
}: {
  primary?: ReactNode;
  save?: ReactNode;
  share?: ReactNode;
  /** Overflow items; falsy entries are dropped and an empty list hides the menu. */
  more?: ReactNode[];
  /** Staff-only controls, kept outside the menu (they render nothing for readers). */
  admin?: ReactNode;
  className?: string;
}) {
  const items = (more ?? []).filter(Boolean);
  return (
    <div
      data-testid="detail-action-bar"
      className={cn('relative flex flex-wrap items-center gap-2', className)}
    >
      {primary}
      {(save || share) && (
        <div className="flex items-center rounded-element border border-border-hairline bg-card">
          {save}
          {share}
        </div>
      )}
      {items.length > 0 && <MoreActions>{items}</MoreActions>}
      {admin}
    </div>
  );
}

function MoreActions({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDetailsElement>(null);

  // `<details>` has no light dismiss; close on an outside click or Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      // Keep the dialog's trigger visible until it restores focus on close.
      if (
        !el.contains(document.activeElement) &&
        document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')
      )
        return;
      if (e instanceof KeyboardEvent) {
        // A nested dialog owns Escape while focus is in its portal.
        if (e.key !== 'Escape' || !el.contains(document.activeElement)) return;
        el.querySelector('summary')?.focus();
        el.open = false;
      } else if (!el.contains(e.target as Node)) {
        el.open = false;
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  return (
    <details ref={ref}>
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-element border border-border-hairline bg-card text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <MoreHorizontal size={20} aria-hidden="true" />
        <span className="sr-only">{t('events.detail.moreOptions', 'More options')}</span>
      </summary>
      {/* Menu rows: every item is normalised to a full-width, left-aligned,
          borderless row whatever button variant it renders on its own. */}
      <div
        data-testid="detail-action-menu"
        className="absolute left-0 top-full z-20 mt-2 flex w-64 max-w-full flex-col rounded-container bg-background p-2 shadow-soft-lg sm:left-auto sm:right-0 [&_a]:flex [&_a]:min-h-11 [&_a]:w-full [&_a]:items-center [&_a]:justify-start [&_a]:gap-2 [&_a]:px-4 [&_a]:text-sm [&_a]:font-semibold [&_button]:min-h-11 [&_button]:w-full [&_button]:justify-start [&_button]:gap-2 [&_button]:px-4 [&_button]:text-sm [&_svg]:mr-0 [&_svg]:size-4 [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-foreground [&_button]:shadow-none [&_button:hover]:bg-muted"
      >
        {children}
      </div>
    </details>
  );
}
