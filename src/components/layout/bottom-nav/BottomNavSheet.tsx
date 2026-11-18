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
  openedByPointer = false,
  onDismissFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Tap-opened: focus the sheet itself rather than ringing its first link. */
  openedByPointer?: boolean;
  /** Where focus goes on close; defaults to Radix's (the trigger). */
  onDismissFocus?: () => void;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        {...(description ? {} : { 'aria-describedby': undefined })}
        overlayClassName="bg-black/20 backdrop-blur-none"
        className="mobile-hub-sheet inset-x-0 bottom-0 top-auto mx-auto max-h-[85dvh] grid-cols-1 translate-x-0 translate-y-0 gap-6 overflow-y-auto rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:animate-none data-[state=closed]:animate-none"
        onOpenAutoFocus={(event) => {
          if (openedByPointer) {
            event.preventDefault();
            contentRef.current?.focus({ preventScroll: true });
          }
        }}
        onCloseAutoFocus={
          onDismissFocus
            ? (event) => {
                event.preventDefault();
                onDismissFocus();
              }
            : undefined
        }
      >
        <DialogHeader className="pe-8 text-left">
          <DialogTitle className="font-display text-headline">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
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
}: {
  to: string;
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
}) {
  return (
    <LocalizedLink
      to={to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 rounded-element p-4 text-center no-underline transition-colors',
        active ? 'bg-foreground text-background' : 'hover:bg-foreground hover:text-background',
      )}
    >
      <Icon size={20} aria-hidden />
      {/* `truncate` — at 320px a grid cell is ~58px wide. */}
      <span className="w-full truncate text-2xs font-bold leading-tight">{label}</span>
      {badge && <span className="absolute end-2 top-2 flex">{badge}</span>}
    </LocalizedLink>
  );
}
