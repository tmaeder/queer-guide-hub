import * as React from "react"
import MuiPopover from "@mui/material/Popover"

interface PopoverContextValue {
  anchorEl: HTMLElement | null;
  setAnchorEl: (el: HTMLElement | null) => void;
  controlledOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const PopoverContext = React.createContext<PopoverContextValue>({
  anchorEl: null,
  setAnchorEl: () => {},
});

interface PopoverProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function Popover({ children, open, onOpenChange }: PopoverProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  return (
    <PopoverContext.Provider value={{ anchorEl, setAnchorEl, controlledOpen: open, onOpenChange }}>
      {children}
    </PopoverContext.Provider>
  );
}

const PopoverTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onClick, ...props }, ref) => {
    const { anchorEl, setAnchorEl, controlledOpen, onOpenChange } = React.useContext(PopoverContext);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      // Always store the anchor element for positioning
      setAnchorEl(e.currentTarget);
      if (onOpenChange) {
        // Controlled mode: toggle via callback
        onOpenChange(controlledOpen !== undefined ? !controlledOpen : !anchorEl);
      } else {
        // Uncontrolled mode: toggle anchor
        setAnchorEl(anchorEl ? null : e.currentTarget);
      }
      onClick?.(e);
    };
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, { onClick: handleClick, ref });
    }
    return <button ref={ref} onClick={handleClick} type="button" {...props}>{children}</button>;
  }
);
PopoverTrigger.displayName = "PopoverTrigger"

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
  onOpenAutoFocus?: (e: any) => void;
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, children, align = "center", sideOffset = 4, style, ...props }, ref) => {
    const { anchorEl, setAnchorEl, controlledOpen, onOpenChange } = React.useContext(PopoverContext);

    // Determine if open: controlled mode uses controlledOpen, uncontrolled uses anchorEl
    const isOpen = controlledOpen !== undefined ? controlledOpen : Boolean(anchorEl);

    const handleClose = () => {
      if (onOpenChange) {
        onOpenChange(false);
      } else {
        setAnchorEl(null);
      }
    };

    return (
      <MuiPopover
        open={isOpen && Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        anchorOrigin={{ vertical: 'bottom', horizontal: align === 'start' ? 'left' : align === 'end' ? 'right' : 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: align === 'start' ? 'left' : align === 'end' ? 'right' : 'center' }}
        slotProps={{ paper: { ref: ref as any, className, style: { marginTop: sideOffset, ...style }, sx: { borderRadius: 1.25, minWidth: 288, p: 2 } } }}
      >
        {children}
      </MuiPopover>
    );
  }
);
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent }
