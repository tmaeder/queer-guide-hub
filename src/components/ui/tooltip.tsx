import * as React from "react"
import MuiTooltip from "@mui/material/Tooltip"

function TooltipProvider({ children }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>;
}

function Tooltip({ children }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>;
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, { ref, ...props });
    }
    return <button ref={ref} type="button" {...props}>{children}</button>;
  }
);
TooltipTrigger.displayName = "TooltipTrigger"

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
}

// NOTE: MUI Tooltip works differently — it wraps its trigger child.
// This compatibility layer requires that TooltipContent is used inside a Tooltip
// which wraps a TooltipTrigger. We use a context-free approach.
const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, children, side = "top", ...props }, ref) => {
    // This component renders its content. The actual MUI Tooltip wrapping
    // needs to happen at the parent level. For compat, just render text.
    return <span ref={ref as any} className={className} data-tooltip-content {...(props as any)}>{children}</span>;
  }
);
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
