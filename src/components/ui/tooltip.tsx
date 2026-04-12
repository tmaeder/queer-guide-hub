import * as React from "react"
import MuiTooltip from "@mui/material/Tooltip"

// Internal context to pass tooltip content from TooltipContent up to the Tooltip wrapper
const TooltipContext = React.createContext<{
  setTitle: (title: React.ReactNode) => void;
}>({ setTitle: () => {} });

function TooltipProvider({ children }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>;
}

function Tooltip({ children, delayDuration }: { children: React.ReactNode; delayDuration?: number }) {
  const [title, setTitle] = React.useState<React.ReactNode>("");
  const [placement, _setPlacement] = React.useState<
    'top' | 'right' | 'bottom' | 'left'
  >('top');

  // Context also carries placement from TooltipContent
  const ctx = React.useMemo(() => ({ setTitle }), []);

  return (
    <TooltipContext.Provider value={ctx}>
      <MuiTooltip
        title={title || ""}
        placement={placement}
        enterDelay={delayDuration || 200}
        enterTouchDelay={50}
        arrow
        slotProps={{
          tooltip: {
            sx: {
              bgcolor: '#333333',
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 500,
              borderRadius: '6px',
              px: 1.5,
              py: 0.75,
            },
          },
          arrow: {
            sx: { color: '#333333' },
          },
        }}
      >
        <span style={{ display: 'inline-flex' }}>{children}</span>
      </MuiTooltip>
    </TooltipContext.Provider>
  );
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { ref, ...props });
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

const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ _className, children, _side = "top", ..._props }, _ref) => {
    const { setTitle } = React.useContext(TooltipContext);

    // Push children as the tooltip title into MUI Tooltip via context
    React.useEffect(() => {
      setTitle(children);
    }, [children, setTitle]);

    // Render nothing visible — content is shown by MUI Tooltip
    return null;
  }
);
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
