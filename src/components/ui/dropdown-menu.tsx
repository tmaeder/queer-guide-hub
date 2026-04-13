import * as React from "react"
import MuiMenu from "@mui/material/Menu"
import MuiMenuItem from "@mui/material/MenuItem"
import MuiDivider from "@mui/material/Divider"
import ListItemIcon from "@mui/material/ListItemIcon"
import Typography from "@mui/material/Typography"
import MuiCheckbox from "@mui/material/Checkbox"
import MuiRadio from "@mui/material/Radio"
import { ChevronRight } from "lucide-react"

const DropdownMenuContext = React.createContext<{
  anchorEl: HTMLElement | null;
  setAnchorEl: (el: HTMLElement | null) => void;
}>({ anchorEl: null, setAnchorEl: () => {} });

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  return <DropdownMenuContext.Provider value={{ anchorEl, setAnchorEl }}>{children}</DropdownMenuContext.Provider>;
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onClick, ...props }, ref) => {
    const { anchorEl, setAnchorEl } = React.useContext(DropdownMenuContext);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(anchorEl ? null : e.currentTarget);
      onClick?.(e);
    };
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { onClick: handleClick, ref });
    }
    return <button ref={ref} onClick={handleClick} type="button" {...props}>{children}</button>;
  }
);
DropdownMenuTrigger.displayName = "DropdownMenuTrigger"

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  side?: string;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, children, align = "end", sideOffset = 4, style, ..._props }, ref) => {
    const { anchorEl, setAnchorEl } = React.useContext(DropdownMenuContext);
    return (
      <MuiMenu
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: align === 'start' ? 'left' : align === 'end' ? 'right' : 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: align === 'start' ? 'left' : align === 'end' ? 'right' : 'center' }}
        slotProps={{ paper: { ref: ref as React.Ref<HTMLDivElement>, className, style: { marginTop: sideOffset, ...style }, sx: { borderRadius: 0, minWidth: 180 } } }}
      >
        {children}
      </MuiMenu>
    );
  }
);
DropdownMenuContent.displayName = "DropdownMenuContent"

const DropdownMenuItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { inset?: boolean; disabled?: boolean }>(
  ({ className, children, inset, disabled, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} disabled={disabled} style={style}
      sx={{ fontSize: '0.875rem', pl: inset ? 4 : 2 }} {...(props as Record<string, unknown>)}>
      {children}
    </MuiMenuItem>
  )
);
DropdownMenuItem.displayName = "DropdownMenuItem"

const DropdownMenuCheckboxItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }>(
  ({ className, children, checked, onCheckedChange, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style}
      onClick={() => onCheckedChange?.(!checked)} sx={{ fontSize: '0.875rem' }} {...(props as Record<string, unknown>)}>
      <ListItemIcon sx={{ minWidth: 28 }}><MuiCheckbox checked={checked} size="small" sx={{ p: 0 }} /></ListItemIcon>
      {children}
    </MuiMenuItem>
  )
);
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem"

const DropdownMenuRadioItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { value?: string }>(
  ({ className, children, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style} sx={{ fontSize: '0.875rem' }} {...(props as Record<string, unknown>)}>
      <ListItemIcon sx={{ minWidth: 28 }}><MuiRadio size="small" sx={{ p: 0 }} /></ListItemIcon>
      {children}
    </MuiMenuItem>
  )
);
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem"

const DropdownMenuLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }>(
  ({ className, children, inset, style, ...props }, ref) => (
    <Typography ref={ref} className={className} style={style} variant="caption" component="div"
      sx={{ px: 2, py: 0.75, fontWeight: 600, pl: inset ? 4 : 2 }} {...(props as Record<string, unknown>)}>
      {children}
    </Typography>
  )
);
DropdownMenuLabel.displayName = "DropdownMenuLabel"

function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <MuiDivider className={className} sx={{ my: 0.5 }} {...(props as Record<string, unknown>)} />;
}

function DropdownMenuShortcut({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <Typography component="span" className={className} variant="caption" sx={{ ml: 'auto', opacity: 0.6, letterSpacing: '0.1em' }} {...(props as Record<string, unknown>)}>{children}</Typography>;
}

function DropdownMenuGroup({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function DropdownMenuPortal({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function DropdownMenuSub({ children }: { children: React.ReactNode }) { return <>{children}</>; }

const DropdownMenuSubTrigger = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { inset?: boolean }>(
  ({ className, children, inset, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style} sx={{ fontSize: '0.875rem', pl: inset ? 4 : 2 }} {...(props as Record<string, unknown>)}>
      {children}
      <ChevronRight style={{ width: 16, height: 16, marginLeft: 'auto' }} />
    </MuiMenuItem>
  )
);
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger"

const DropdownMenuSubContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>
);
DropdownMenuSubContent.displayName = "DropdownMenuSubContent"

function DropdownMenuRadioGroup({ children, ..._props }: React.HTMLAttributes<HTMLDivElement> & { value?: string; onValueChange?: (value: string) => void }) { return <>{children}</>; }

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup,
  DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuRadioGroup,
}
