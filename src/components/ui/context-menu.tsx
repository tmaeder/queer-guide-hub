import * as React from "react"
import MuiMenu from "@mui/material/Menu"
import MuiMenuItem from "@mui/material/MenuItem"
import MuiDivider from "@mui/material/Divider"
import Typography from "@mui/material/Typography"
import MuiCheckbox from "@mui/material/Checkbox"
import MuiRadio from "@mui/material/Radio"
import ListItemIcon from "@mui/material/ListItemIcon"
import { ChevronRight } from "lucide-react"

const ContextMenuContext = React.createContext<{
  anchorPosition: { top: number; left: number } | null;
  setAnchorPosition: (pos: { top: number; left: number } | null) => void;
}>({ anchorPosition: null, setAnchorPosition: () => {} });

function ContextMenu({ children }: { children: React.ReactNode }) {
  const [anchorPosition, setAnchorPosition] = React.useState<{ top: number; left: number } | null>(null);
  return <ContextMenuContext.Provider value={{ anchorPosition, setAnchorPosition }}>{children}</ContextMenuContext.Provider>;
}

const ContextMenuTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, onContextMenu, ...props }, ref) => {
    const { setAnchorPosition } = React.useContext(ContextMenuContext);
    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setAnchorPosition({ top: e.clientY, left: e.clientX });
      (onContextMenu as any)?.(e);
    };
    return <div ref={ref} onContextMenu={handleContextMenu} {...props}>{children}</div>;
  }
);
ContextMenuTrigger.displayName = "ContextMenuTrigger"

const ContextMenuContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => {
    const { anchorPosition, setAnchorPosition } = React.useContext(ContextMenuContext);
    return (
      <MuiMenu open={Boolean(anchorPosition)} onClose={() => setAnchorPosition(null)}
        anchorReference="anchorPosition" anchorPosition={anchorPosition || undefined}
        slotProps={{ paper: { ref: ref as any, className, style, sx: { borderRadius: 1.25, minWidth: 180 } } }}>
        {children}
      </MuiMenu>
    );
  }
);
ContextMenuContent.displayName = "ContextMenuContent"

const ContextMenuItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { inset?: boolean; disabled?: boolean }>(
  ({ className, children, inset, disabled, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} disabled={disabled} style={style}
      sx={{ fontSize: '0.875rem', pl: inset ? 4 : 2 }} {...(props as any)}>{children}</MuiMenuItem>
  )
);
ContextMenuItem.displayName = "ContextMenuItem"

const ContextMenuCheckboxItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }>(
  ({ className, children, checked, onCheckedChange, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style} onClick={() => onCheckedChange?.(!checked)} sx={{ fontSize: '0.875rem' }} {...(props as any)}>
      <ListItemIcon sx={{ minWidth: 28 }}><MuiCheckbox checked={checked} size="small" sx={{ p: 0 }} /></ListItemIcon>
      {children}
    </MuiMenuItem>
  )
);
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem"

const ContextMenuRadioItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { value?: string }>(
  ({ className, children, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style} sx={{ fontSize: '0.875rem' }} {...(props as any)}>
      <ListItemIcon sx={{ minWidth: 28 }}><MuiRadio size="small" sx={{ p: 0 }} /></ListItemIcon>
      {children}
    </MuiMenuItem>
  )
);
ContextMenuRadioItem.displayName = "ContextMenuRadioItem"

const ContextMenuLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }>(
  ({ className, children, inset, style, ...props }, ref) => (
    <Typography ref={ref} className={className} style={style} variant="caption" component="div"
      sx={{ px: 2, py: 0.75, fontWeight: 600, pl: inset ? 4 : 2 }} {...(props as any)}>{children}</Typography>
  )
);
ContextMenuLabel.displayName = "ContextMenuLabel"

function ContextMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <MuiDivider className={className} sx={{ my: 0.5 }} {...(props as any)} />;
}

function ContextMenuShortcut({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <Typography component="span" className={className} variant="caption" sx={{ ml: 'auto', opacity: 0.6, letterSpacing: '0.1em' }} {...(props as any)}>{children}</Typography>;
}

function ContextMenuGroup({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function ContextMenuPortal({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function ContextMenuSub({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function ContextMenuRadioGroup({ children }: { children: React.ReactNode; value?: string; onValueChange?: (v: string) => void }) { return <>{children}</>; }

const ContextMenuSubTrigger = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { inset?: boolean }>(
  ({ className, children, inset, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style} sx={{ fontSize: '0.875rem', pl: inset ? 4 : 2 }} {...(props as any)}>
      {children}
      <ChevronRight style={{ width: 16, height: 16, marginLeft: 'auto' }} />
    </MuiMenuItem>
  )
);
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger"

const ContextMenuSubContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>
);
ContextMenuSubContent.displayName = "ContextMenuSubContent"

export {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuCheckboxItem, ContextMenuRadioItem, ContextMenuLabel,
  ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup,
  ContextMenuPortal, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuRadioGroup,
}
