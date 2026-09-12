import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SheetContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

/**
 * Wires `SheetTitle` to `SheetContent`'s `aria-labelledby`.
 *
 * This Sheet is hand-rolled (createPortal + context), NOT Radix — so unlike
 * `DialogTitle`, which wraps `DialogPrimitive.Title` and gets the association for
 * free, `SheetTitle` was a bare id-less `<h2>`. `SheetContent` declares
 * `role="dialog"` and `aria-modal="true"` with no name, which is an axe
 * `aria-dialog-name` violation (serious) — and it applied to all 32 sheets in the
 * app, including the 25 whose authors HAD added a `SheetTitle` and reasonably
 * believed that named the dialog.
 *
 * The title registers itself rather than `SheetContent` assuming one exists:
 * pointing `aria-labelledby` at an id that never renders is worse than omitting
 * it, because assistive tech then resolves the name to nothing while the
 * attribute looks satisfied. A caller with no visible heading passes `aria-label`
 * instead, which still wins because it is spread onto the dialog element.
 */
const SheetTitleContext = React.createContext<{
  titleId: string;
  registerTitle: () => void;
} | null>(null);

function Sheet({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) setInternalOpen(newOpen);
    onOpenChange?.(newOpen);
  };
  return (
    <SheetContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
}

const SheetTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ children, asChild, onClick, ...props }, ref) => {
  const { onOpenChange } = React.useContext(SheetContext);
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onOpenChange(true);
    onClick?.(e);
  };
  if (asChild && React.isValidElement(children))
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onClick: handleClick,
      ref,
    });
  return (
    <button ref={ref} onClick={handleClick} type="button" {...props}>
      {children}
    </button>
  );
});
SheetTrigger.displayName = 'SheetTrigger';

const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ children, asChild, onClick, ...props }, ref) => {
  const { onOpenChange } = React.useContext(SheetContext);
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onOpenChange(false);
    onClick?.(e);
  };
  if (asChild && React.isValidElement(children))
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onClick: handleClick,
      ref,
    });
  return (
    <button ref={ref} onClick={handleClick} type="button" {...props}>
      {children}
    </button>
  );
});
SheetClose.displayName = 'SheetClose';

const SheetPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const SheetOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  () => null,
);
SheetOverlay.displayName = 'SheetOverlay';

type SheetSide = 'top' | 'bottom' | 'left' | 'right';

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: SheetSide;
}

const sideClasses: Record<SheetSide, string> = {
  right:
    'inset-y-0 right-0 h-full w-full sm:w-[400px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  left: 'inset-y-0 left-0 h-full w-full sm:w-[400px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
  top: 'inset-x-0 top-0 w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom:
    'inset-x-0 bottom-0 w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
};

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, side = 'right', ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(SheetContext);
    const titleId = React.useId();
    const [hasTitle, setHasTitle] = React.useState(false);
    const registerTitle = React.useCallback(() => setHasTitle(true), []);
    const titleCtx = React.useMemo(() => ({ titleId, registerTitle }), [titleId, registerTitle]);

    React.useEffect(() => {
      if (!open) return;
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onOpenChange(false);
      };
      document.addEventListener('keydown', handleKey);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKey);
        document.body.style.overflow = prev;
      };
    }, [open, onOpenChange]);

    const dialogRefCallback = React.useCallback(
      (node: HTMLDivElement | null) => {
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (!node) return;
        requestAnimationFrame(() => {
          const focusable = node.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          (focusable || node).focus();
        });
      },
      [ref],
    );

    if (!open) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
      <div className="fixed inset-0 z-50">
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-normal"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
        <div
          ref={dialogRefCallback}
          role="dialog"
          aria-modal="true"
          // Only when a SheetTitle actually rendered — see SheetTitleContext.
          // An explicit aria-label from the caller still wins via {...props}.
          aria-labelledby={hasTitle ? titleId : undefined}
          tabIndex={-1}
          data-state={open ? 'open' : 'closed'}
          className={cn(
            'fixed bg-surface-container-highest p-6 transition-transform duration-normal ease-[cubic-bezier(0.22,1,0.36,1)] overflow-auto',
            side === 'left' || side === 'right' ? 'rounded-none' : 'rounded-t-panel',
            sideClasses[side],
            className,
          )}
          {...props}
        >
          <SheetTitleContext.Provider value={titleCtx}>{children}</SheetTitleContext.Provider>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-element text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>,
      document.body,
    );
  },
);
SheetContent.displayName = 'SheetContent';

const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-2', className)} {...props}>
      {children}
    </div>
  ),
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('flex justify-end gap-2 pt-4', className)} {...props}>
      {children}
    </div>
  ),
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, id, ...props }, ref) => {
    const ctx = React.useContext(SheetTitleContext);
    React.useEffect(() => {
      ctx?.registerTitle();
    }, [ctx]);
    return (
      <h2
        ref={ref}
        // A caller-supplied id wins; otherwise take the one SheetContent is
        // pointing aria-labelledby at.
        id={id ?? ctx?.titleId}
        className={cn('text-lg font-semibold leading-tight', className)}
        {...props}
      >
        {children}
      </h2>
    );
  },
);
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props}>
    {children}
  </p>
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
