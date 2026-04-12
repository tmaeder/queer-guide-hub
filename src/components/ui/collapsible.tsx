import * as React from "react"
import MuiCollapse from "@mui/material/Collapse"

interface CollapsibleProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  disabled?: boolean;
}

const CollapsibleContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}>({ open: false, onOpenChange: () => {} });

function Collapsible({ children, open: controlledOpen, onOpenChange, defaultOpen = false, disabled }: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const handleChange = (newOpen: boolean) => {
    if (disabled) return;
    if (!isControlled) setInternalOpen(newOpen);
    onOpenChange?.(newOpen);
  };
  return <CollapsibleContext.Provider value={{ open, onOpenChange: handleChange, disabled }}>{children}</CollapsibleContext.Provider>;
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onClick, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(CollapsibleContext);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onOpenChange(!open);
      onClick?.(e);
    };
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { onClick: handleClick, ref });
    }
    return <button ref={ref} onClick={handleClick} type="button" {...props}>{children}</button>;
  }
);
CollapsibleTrigger.displayName = "CollapsibleTrigger"

const CollapsibleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className, style, ...props }, ref) => {
    const { open } = React.useContext(CollapsibleContext);
    return (
      <MuiCollapse in={open} unmountOnExit>
        <div ref={ref} className={className} style={style} {...props}>{children}</div>
      </MuiCollapse>
    );
  }
);
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
