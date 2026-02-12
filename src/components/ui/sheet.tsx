import * as React from "react"
import MuiDrawer from "@mui/material/Drawer"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import { X } from "lucide-react"

const SheetContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

function Sheet({ children, open: controlledOpen, onOpenChange }: {
  children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) setInternalOpen(newOpen);
    onOpenChange?.(newOpen);
  };
  return <SheetContext.Provider value={{ open, onOpenChange: handleOpenChange }}>{children}</SheetContext.Provider>;
}

const SheetTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onClick, ...props }, ref) => {
    const { onOpenChange } = React.useContext(SheetContext);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => { onOpenChange(true); onClick?.(e); };
    if (asChild && React.isValidElement(children)) return React.cloneElement(children as React.ReactElement<any>, { onClick: handleClick, ref });
    return <button ref={ref} onClick={handleClick} type="button" {...props}>{children}</button>;
  }
);
SheetTrigger.displayName = "SheetTrigger"

const SheetClose = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onClick, ...props }, ref) => {
    const { onOpenChange } = React.useContext(SheetContext);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => { onOpenChange(false); onClick?.(e); };
    if (asChild && React.isValidElement(children)) return React.cloneElement(children as React.ReactElement<any>, { onClick: handleClick, ref });
    return <button ref={ref} onClick={handleClick} type="button" {...props}>{children}</button>;
  }
);
SheetClose.displayName = "SheetClose"

const SheetPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const SheetOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(() => null);
SheetOverlay.displayName = "SheetOverlay"

type SheetSide = "top" | "bottom" | "left" | "right";

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: SheetSide;
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, side = "right", style, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(SheetContext);
    const anchor = side === "left" ? "left" : side === "top" ? "top" : side === "bottom" ? "bottom" : "right";
    return (
      <MuiDrawer
        open={open}
        onClose={() => onOpenChange(false)}
        anchor={anchor}
        className={className}
        PaperProps={{
          ref: ref as any,
          sx: {
            width: side === "left" || side === "right" ? { xs: '100%', sm: 400 } : '100%',
            height: side === "top" || side === "bottom" ? 'auto' : '100%',
            p: 3,
          },
        }}
      >
        {children}
        <IconButton aria-label="Close" onClick={() => onOpenChange(false)}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }} size="small">
          <X style={{ width: 16, height: 16 }} />
        </IconButton>
      </MuiDrawer>
    );
  }
);
SheetContent.displayName = "SheetContent"

const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <div ref={ref} className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }} {...props}>{children}</div>
  )
);
SheetHeader.displayName = "SheetHeader"

const SheetFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <div ref={ref} className={className} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, ...style }} {...props}>{children}</div>
  )
);
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, style, ...props }, ref) => (
    <Typography ref={ref} variant="h6" component="h2" className={className} style={style}
      sx={{ fontWeight: 600 }} {...(props as any)}>{children}</Typography>
  )
);
SheetTitle.displayName = "SheetTitle"

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, style, ...props }, ref) => (
    <Typography ref={ref} variant="body2" color="text.secondary" className={className} style={style} {...(props as any)}>{children}</Typography>
  )
);
SheetDescription.displayName = "SheetDescription"

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
