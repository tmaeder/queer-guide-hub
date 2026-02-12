import * as React from "react"
import MuiPopover from "@mui/material/Popover"

const PopoverContext = React.createContext<{
  anchorEl: HTMLElement | null;
  setAnchorEl: (el: HTMLElement | null) => void;
}>({ anchorEl: null, setAnchorEl: () => {} });

function Popover({ children }: { children: React.ReactNode }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  return (
    <PopoverContext.Provider value={{ anchorEl, setAnchorEl }}>
      {children}
    </PopoverContext.Provider>
  );
}

const PopoverTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onClick, ...props }, ref) => {
    const { anchorEl, setAnchorEl } = React.useContext(PopoverContext);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(anchorEl ? null : e.currentTarget);
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
    const { anchorEl, setAnchorEl } = React.useContext(PopoverContext);
    return (
      <MuiPopover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
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
