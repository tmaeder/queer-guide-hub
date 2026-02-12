import * as React from "react"
import MuiMenu from "@mui/material/Menu"
import MuiMenuItem from "@mui/material/MenuItem"
import MuiDivider from "@mui/material/Divider"
import Typography from "@mui/material/Typography"
import ListItemIcon from "@mui/material/ListItemIcon"
import MuiCheckbox from "@mui/material/Checkbox"
import MuiRadio from "@mui/material/Radio"
import { ChevronRight } from "lucide-react"

function MenubarMenu({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function MenubarGroup({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function MenubarPortal({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function MenubarSub({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function MenubarRadioGroup({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: string; onValueChange?: (v: string) => void }) { return <>{children}</>; }

const MenubarContext = React.createContext<{
  anchorEl: HTMLElement | null;
  setAnchorEl: (el: HTMLElement | null) => void;
  activeMenu: string | null;
  setActiveMenu: (id: string | null) => void;
}>({ anchorEl: null, setAnchorEl: () => {}, activeMenu: null, setActiveMenu: () => {} });

const Menubar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => {
    const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
    const [activeMenu, setActiveMenu] = React.useState<string | null>(null);
    return (
      <MenubarContext.Provider value={{ anchorEl, setAnchorEl, activeMenu, setActiveMenu }}>
        <div ref={ref} className={className}
          style={{ display: 'flex', height: 40, alignItems: 'center', gap: 4, borderRadius: 10, border: '1px solid var(--border, #e4e4e7)', padding: 4, ...style }} {...props}>
          {children}
        </div>
      </MenubarContext.Provider>
    );
  }
);
Menubar.displayName = "Menubar"

const MenubarTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, onClick, style, ...props }, ref) => {
    const { anchorEl, setAnchorEl, setActiveMenu } = React.useContext(MenubarContext);
    const id = React.useId();
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(anchorEl ? null : e.currentTarget);
      setActiveMenu(id);
      onClick?.(e);
    };
    return (
      <button ref={ref} className={className} onClick={handleClick}
        style={{ display: 'flex', cursor: 'default', userSelect: 'none', alignItems: 'center', borderRadius: 4, padding: '4px 12px', fontSize: '0.875rem', fontWeight: 500, border: 'none', background: 'none', ...style }} {...props}>
        {children}
      </button>
    );
  }
);
MenubarTrigger.displayName = "MenubarTrigger"

const MenubarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { align?: string; alignOffset?: number; sideOffset?: number }>(
  ({ className, children, align, alignOffset, sideOffset = 8, style, ...props }, ref) => {
    const { anchorEl, setAnchorEl } = React.useContext(MenubarContext);
    return (
      <MuiMenu open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { ref: ref as any, className, style, sx: { borderRadius: 1.25, minWidth: 192, mt: 1 } } }}>
        {children}
      </MuiMenu>
    );
  }
);
MenubarContent.displayName = "MenubarContent"

const MenubarItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { inset?: boolean; disabled?: boolean }>(
  ({ className, children, inset, disabled, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} disabled={disabled} style={style}
      sx={{ fontSize: '0.875rem', pl: inset ? 4 : 2 }} {...(props as any)}>{children}</MuiMenuItem>
  )
);
MenubarItem.displayName = "MenubarItem"

const MenubarCheckboxItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }>(
  ({ className, children, checked, onCheckedChange, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style} onClick={() => onCheckedChange?.(!checked)} sx={{ fontSize: '0.875rem' }} {...(props as any)}>
      <ListItemIcon sx={{ minWidth: 28 }}><MuiCheckbox checked={checked} size="small" sx={{ p: 0 }} /></ListItemIcon>
      {children}
    </MuiMenuItem>
  )
);
MenubarCheckboxItem.displayName = "MenubarCheckboxItem"

const MenubarRadioItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { value?: string }>(
  ({ className, children, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style} sx={{ fontSize: '0.875rem' }} {...(props as any)}>
      <ListItemIcon sx={{ minWidth: 28 }}><MuiRadio size="small" sx={{ p: 0 }} /></ListItemIcon>
      {children}
    </MuiMenuItem>
  )
);
MenubarRadioItem.displayName = "MenubarRadioItem"

const MenubarLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }>(
  ({ className, children, inset, style, ...props }, ref) => (
    <Typography ref={ref} className={className} style={style} variant="caption" component="div"
      sx={{ px: 2, py: 0.75, fontWeight: 600, pl: inset ? 4 : 2 }} {...(props as any)}>{children}</Typography>
  )
);
MenubarLabel.displayName = "MenubarLabel"

function MenubarSeparator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <MuiDivider className={className} sx={{ my: 0.5 }} {...(props as any)} />;
}

function MenubarShortcut({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <Typography component="span" className={className} variant="caption" sx={{ ml: 'auto', opacity: 0.6, letterSpacing: '0.1em' }} {...(props as any)}>{children}</Typography>;
}

const MenubarSubTrigger = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement> & { inset?: boolean }>(
  ({ className, children, inset, style, ...props }, ref) => (
    <MuiMenuItem ref={ref} className={className} style={style} sx={{ fontSize: '0.875rem', pl: inset ? 4 : 2 }} {...(props as any)}>
      {children}
      <ChevronRight style={{ width: 16, height: 16, marginLeft: 'auto' }} />
    </MuiMenuItem>
  )
);
MenubarSubTrigger.displayName = "MenubarSubTrigger"

const MenubarSubContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>
);
MenubarSubContent.displayName = "MenubarSubContent"

export { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator, MenubarLabel, MenubarCheckboxItem, MenubarRadioGroup, MenubarRadioItem, MenubarPortal, MenubarSubContent, MenubarSubTrigger, MenubarGroup, MenubarSub, MenubarShortcut }
