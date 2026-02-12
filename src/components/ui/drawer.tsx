import * as React from "react"
import MuiDrawer from "@mui/material/Drawer"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"

const DrawerContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

function Drawer({ children, open: controlledOpen, onOpenChange, shouldScaleBackground, ...props }: {
  children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; shouldScaleBackground?: boolean;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) setInternalOpen(newOpen);
    onOpenChange?.(newOpen);
  };
  return <DrawerContext.Provider value={{ open, onOpenChange: handleOpenChange }}>{children}</DrawerContext.Provider>;
}

const DrawerTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onClick, ...props }, ref) => {
    const { onOpenChange } = React.useContext(DrawerContext);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => { onOpenChange(true); onClick?.(e); };
    if (asChild && React.isValidElement(children)) return React.cloneElement(children as React.ReactElement<any>, { onClick: handleClick, ref });
    return <button ref={ref} onClick={handleClick} type="button" {...props}>{children}</button>;
  }
);
DrawerTrigger.displayName = "DrawerTrigger"

const DrawerClose = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onClick, ...props }, ref) => {
    const { onOpenChange } = React.useContext(DrawerContext);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => { onOpenChange(false); onClick?.(e); };
    if (asChild && React.isValidElement(children)) return React.cloneElement(children as React.ReactElement<any>, { onClick: handleClick, ref });
    return <button ref={ref} onClick={handleClick} type="button" {...props}>{children}</button>;
  }
);
DrawerClose.displayName = "DrawerClose"

const DrawerPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DrawerOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(() => null);
DrawerOverlay.displayName = "DrawerOverlay"

const DrawerContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(DrawerContext);
    return (
      <MuiDrawer open={open} onClose={() => onOpenChange(false)} anchor="bottom" className={className}
        PaperProps={{
          ref: ref as any,
          sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, maxHeight: '90vh' },
        }}>
        <Box sx={{ mx: 'auto', mt: 2, mb: 1, width: 48, height: 6, borderRadius: 3, bgcolor: 'action.disabled' }} />
        <Box sx={{ p: 2 }}>{children}</Box>
      </MuiDrawer>
    );
  }
);
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <div ref={ref} className={className} style={{ display: 'grid', gap: 6, padding: '16px 0', textAlign: 'center', ...style }} {...props}>{children}</div>
  )
);
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <div ref={ref} className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 0', ...style }} {...props}>{children}</div>
  )
);
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, style, ...props }, ref) => (
    <Typography ref={ref} variant="h6" component="h2" className={className} style={style}
      sx={{ fontWeight: 600, lineHeight: 1, letterSpacing: '-0.015em' }} {...(props as any)}>{children}</Typography>
  )
);
DrawerTitle.displayName = "DrawerTitle"

const DrawerDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, style, ...props }, ref) => (
    <Typography ref={ref} variant="body2" color="text.secondary" className={className} style={style} {...(props as any)}>{children}</Typography>
  )
);
DrawerDescription.displayName = "DrawerDescription"

export { Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription }
