import { useRef, type ComponentType, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';

/**
 * The one bottom sheet behind the dock's Browse and Hub tabs. Both menus open
 * from the same bar, so they share the shell, the header, the section heading
 * and the tile — before this they were two components (a hand-rolled Sheet and
 * a Radix Dialog) with two headers and two item shapes.
 *
 * Radix Dialog, not the hand-rolled Sheet: it returns focus to the dock tab on
 * close, which the Sheet cannot.
 */
export function BottomNavSheet({
  open,
  onOpenChange,
  title,
  description,
  headerAction,
  hideTitle = false,
  openedByPointer = false,
  onDismissFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Optional control beside the title, e.g. a link to the section's home. */
  headerAction?: ReactNode;
  /** Keep the title for screen readers only (the dialog still needs a name). */
  hideTitle?: boolean;
  /** Tap-opened: focus the sheet itself rather than ringing its first link. */
  openedByPointer?: boolean;
  /** Where focus goes on close; defaults to Radix's (the trigger). */
  onDismissFocus?: () => void;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        {...(description ? {} : { 'aria-describedby': undefined })}
        overlayClassName="bg-black/20 backdrop-blur-none"
        className={cn(
          'mobile-hub-sheet inset-x-0 bottom-0 top-auto mx-auto max-h-[85dvh] grid-cols-1 translate-x-0 translate-y-0 gap-4 overflow-y-auto rounded-b-none bg-card px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:animate-none data-[state=closed]:animate-none',
          // No title row: start the content below the close button.
          hideTitle ? 'pt-16' : 'pt-6',
        )}
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (openedByPointer) {
            event.preventDefault();
            contentRef.current?.focus({ preventScroll: true });
          }
        }}
        onCloseAutoFocus={(event) => {
          // These sheets are controlled from dock links, not DialogTrigger.
          event.preventDefault();
          if (onDismissFocus) onDismissFocus();
          else if (returnFocus.current?.isConnected)
            returnFocus.current.focus({ preventScroll: true });
        }}
      >
        <DialogHeader className={hideTitle ? 'sr-only' : 'pe-10 text-left'}>
          <div className="flex items-baseline justify-between gap-4">
            <DialogTitle className="font-display text-headline">{title}</DialogTitle>
            {headerAction}
          </div>
          {/* Read by assistive tech; the title already says what the sheet is. */}
          {description && <DialogDescription className="sr-only">{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Section heading inside a bottom-nav sheet. */
export const NAV_SHEET_HEADING =
  'text-2xs font-semibold uppercase tracking-wide text-muted-foreground';

/** Icon-over-label tile; the shared item of both sheets. */
export function NavSheetTile({
  to,
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  variant = 'tile',
}: {
  to: string;
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
  /** `tile`: icon over label, for short nouns. `row`: icon beside label, for
   *  labels long enough to truncate in a tile ("Travel buddies"). */
  variant?: 'tile' | 'row';
}) {
  const state = active
    ? 'bg-foreground text-background'
    : 'bg-muted hover:bg-foreground hover:text-background';
  if (variant === 'row') {
    return (
      <LocalizedLink
        to={to}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex min-h-11 items-center gap-2 rounded-element px-2.5 py-1.5 text-13 font-bold no-underline transition-colors',
          state,
        )}
      >
        <Icon size={18} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge && <span className="flex shrink-0">{badge}</span>}
      </LocalizedLink>
    );
  }
  return (
    <LocalizedLink
      to={to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-element px-1.5 py-1.5 text-center no-underline transition-colors',
        state,
      )}
    >
      <Icon size={18} aria-hidden />
      {/* `truncate` — at 320px a grid cell is ~58px wide. */}
      <span className="w-full truncate text-2xs font-bold leading-tight">{label}</span>
      {badge && <span className="absolute end-1 top-1 flex">{badge}</span>}
    </LocalizedLink>
  );
}
