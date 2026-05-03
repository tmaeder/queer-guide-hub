import * as React from 'react';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Zoom from '@mui/material/Zoom';
import { X } from 'lucide-react';
import { duration } from '@/lib/animation';

const DialogContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

interface DialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function Dialog({ children, open: controlledOpen, onOpenChange }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) setInternalOpen(newOpen);
    onOpenChange?.(newOpen);
  };
  return (
    <DialogContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ children, asChild, onClick, ...props }, ref) => {
  const { onOpenChange } = React.useContext(DialogContext);
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onOpenChange(true);
    onClick?.(e);
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onClick: handleClick,
      ref,
    });
  }
  return (
    <button ref={ref} onClick={handleClick} type="button" {...props}>
      {children}
    </button>
  );
});
DialogTrigger.displayName = 'DialogTrigger';

const DialogPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  () => null,
);
DialogOverlay.displayName = 'DialogOverlay';

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ children, asChild, onClick, ...props }, ref) => {
  const { onOpenChange } = React.useContext(DialogContext);
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onOpenChange(false);
    onClick?.(e);
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onClick: handleClick,
      ref,
    });
  }
  return (
    <button ref={ref} onClick={handleClick} type="button" {...props}>
      {children}
    </button>
  );
});
DialogClose.displayName = 'DialogClose';

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onInteractOutside?: (e: Event) => void;
  onPointerDownOutside?: (e: Event) => void;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ..._props }, ref) => {
    const { open, onOpenChange } = React.useContext(DialogContext);
    return (
      <MuiDialog
        open={open}
        onClose={() => onOpenChange(false)}
        maxWidth="sm"
        fullWidth
        className={className}
        TransitionComponent={Zoom}
        transitionDuration={{
          enter: duration.normal * 1000,
          exit: 150,
        }}
        PaperProps={{ ref: ref as React.Ref<HTMLDivElement>, sx: { borderRadius: 0 } }}
      >
        <MuiDialogContent sx={{ p: 3 }}>{children}</MuiDialogContent>
        <IconButton
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
          size="small"
        >
          <X style={{ width: 16, height: 16 }} />
        </IconButton>
      </MuiDialog>
    );
  },
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center', ...style }}
      {...props}
    >
      {children}
    </div>
  ),
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, ...style }}
      {...props}
    >
      {children}
    </div>
  ),
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, style, ...props }, ref) => (
    <Typography
      ref={ref}
      variant="h6"
      component="h2"
      className={className}
      style={style}
      sx={{ fontWeight: 600, lineHeight: 1, letterSpacing: '-0.015em', mb: 0.5 }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Typography>
  ),
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, style, ...props }, ref) => (
  <Typography
    ref={ref}
    variant="body2"
    color="text.secondary"
    className={className}
    style={style}
    {...(props as Record<string, unknown>)}
  >
    {children}
  </Typography>
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
