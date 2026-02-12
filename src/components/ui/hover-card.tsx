import * as React from "react"
import MuiPopover from "@mui/material/Popover"

function HoverCard({ children }: { children: React.ReactNode }) { return <>{children}</>; }

const HoverCardTrigger = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { asChild?: boolean }>(
  ({ children, asChild, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, { ref, ...props });
    }
    return <span ref={ref as any} {...props}>{children}</span>;
  }
);
HoverCardTrigger.displayName = "HoverCardTrigger"

interface HoverCardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const HoverCardContent = React.forwardRef<HTMLDivElement, HoverCardContentProps>(
  ({ className, children, style, ...props }, ref) => (
    <div ref={ref} className={className} style={style} {...props}>{children}</div>
  )
);
HoverCardContent.displayName = "HoverCardContent"

export { HoverCard, HoverCardTrigger, HoverCardContent }
