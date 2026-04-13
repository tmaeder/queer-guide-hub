import * as React from "react"
import MuiSelect, { type SelectChangeEvent } from "@mui/material/Select"
import MuiMenuItem from "@mui/material/MenuItem"
import FormControl from "@mui/material/FormControl"

/**
 * MUI-based Select components that match the Radix UI Select API shape.
 *
 * Usage:
 *   <Select value={v} onValueChange={setV}>
 *     <SelectTrigger style={{ width: 160 }}>
 *       <SelectValue placeholder="Pick one" />
 *     </SelectTrigger>
 *     <SelectContent>
 *       <SelectItem value="a">Alpha</SelectItem>
 *       <SelectItem value="b">Beta</SelectItem>
 *     </SelectContent>
 *   </Select>
 *
 * How it works:
 *   1.  <Select> provides context (value, onChange, items registry).
 *   2.  <SelectItem> registers itself into context on mount so the
 *       trigger knows every available option.
 *   3.  <SelectTrigger> renders the MUI <Select> with all registered
 *       items as <MenuItem> children — this is what MUI needs.
 *   4.  <SelectContent> / <SelectValue> are pass-through wrappers kept
 *       purely for Radix API compatibility.
 */

// ---- Context ----------------------------------------------------------------

interface SelectItemDef {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SelectCtx {
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
  setPlaceholder: (p: string) => void;
  items: SelectItemDef[];
  registerItem: (item: SelectItemDef) => void;
  unregisterItem: (value: string) => void;
}

const SelectContext = React.createContext<SelectCtx>({
  value: "",
  onValueChange: () => {},
  disabled: false,
  placeholder: "",
  setPlaceholder: () => {},
  items: [],
  registerItem: () => {},
  unregisterItem: () => {},
});

// ---- Select (root) ----------------------------------------------------------

interface SelectProps {
  children: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
  required?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function Select({
  children,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
}: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const currentValue = value !== undefined ? value : internalValue;

  const handleChange = React.useCallback(
    (newValue: string) => {
      if (value === undefined) setInternalValue(newValue);
      onValueChange?.(newValue);
    },
    [value, onValueChange],
  );

  // Item registry — SelectItem components register here on mount
  const [items, setItems] = React.useState<SelectItemDef[]>([]);
  const [placeholder, setPlaceholder] = React.useState("");

  const registerItem = React.useCallback((item: SelectItemDef) => {
    setItems((prev) => {
      // Avoid duplicates (StrictMode double-mount)
      if (prev.some((i) => i.value === item.value)) {
        return prev.map((i) => (i.value === item.value ? item : i));
      }
      return [...prev, item];
    });
  }, []);

  const unregisterItem = React.useCallback((val: string) => {
    setItems((prev) => prev.filter((i) => i.value !== val));
  }, []);

  const ctx = React.useMemo<SelectCtx>(
    () => ({
      value: currentValue,
      onValueChange: handleChange,
      disabled,
      placeholder,
      setPlaceholder,
      items,
      registerItem,
      unregisterItem,
    }),
    [currentValue, handleChange, disabled, placeholder, setPlaceholder, items, registerItem, unregisterItem],
  );

  return <SelectContext.Provider value={ctx}>{children}</SelectContext.Provider>;
}

// ---- SelectTrigger ----------------------------------------------------------

interface SelectTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  asChild?: boolean;
}

const SelectTrigger = React.forwardRef<HTMLDivElement, SelectTriggerProps>(
  ({ className, children, style, ...props }, ref) => {
    const { value, onValueChange, disabled, placeholder, items } =
      React.useContext(SelectContext);

    return (
      <FormControl
        size="small"
        disabled={disabled}
        ref={ref as React.Ref<HTMLDivElement>}
        className={className}
        style={style}
      >
        <MuiSelect
          value={value}
          onChange={(e: SelectChangeEvent) => onValueChange(e.target.value)}
          displayEmpty
          renderValue={(selected) => {
            if (!selected || selected === "") {
              return (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>
                  {placeholder || "Select…"}
                </span>
              );
            }
            const match = items.find((i) => i.value === selected);
            return match ? match.label : selected;
          }}
          sx={{
            borderRadius: 0,
            bgcolor: "action.hover",
            "& .MuiSelect-select": { py: 1, px: 1.5 },
          }}
          MenuProps={{
            slotProps: {
              paper: {
                sx: {
                  borderRadius: 0,
                  mt: 0.5,
                  boxShadow: "none",
                },
              },
            },
          }}
          {...(props as Record<string, unknown>)}
        >
          {items.map((item) => (
            <MuiMenuItem
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              sx={{ fontSize: "0.875rem", py: 1 }}
            >
              {item.label}
            </MuiMenuItem>
          ))}
        </MuiSelect>

        {/* Render children so SelectValue & SelectContent mount and register */}
        <div style={{ display: "none" }}>{children}</div>
      </FormControl>
    );
  },
);
SelectTrigger.displayName = "SelectTrigger";

// ---- SelectValue (sets placeholder in context) ------------------------------

interface SelectValueProps {
  placeholder?: string;
  children?: React.ReactNode;
}

function SelectValue({ placeholder: ph }: SelectValueProps) {
  const { setPlaceholder } = React.useContext(SelectContext);
  React.useEffect(() => {
    if (ph) setPlaceholder(ph);
  }, [ph, setPlaceholder]);
  return null;
}

// ---- SelectContent (pass-through — renders children so SelectItems mount) ---

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  position?: string;
}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ children }, _ref) => {
    // Children rendered here so that SelectItem can register into context.
    // They are visually hidden (parent is display:none in SelectTrigger).
    return <>{children}</>;
  },
);
SelectContent.displayName = "SelectContent";

// ---- SelectItem (registers into context) ------------------------------------

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ children, value, disabled }, _ref) => {
    const { registerItem, unregisterItem } = React.useContext(SelectContext);

    React.useEffect(() => {
      registerItem({ value, label: children, disabled });
      return () => unregisterItem(value);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, disabled, registerItem, unregisterItem]);

    // We intentionally re-register when children change so the label stays current
    React.useEffect(() => {
      registerItem({ value, label: children, disabled });
    }, [children, value, disabled, registerItem]);

    // Nothing to render — the MuiMenuItem is rendered inside SelectTrigger
    return null;
  },
);
SelectItem.displayName = "SelectItem";

// ---- Utility wrappers (API compat) ------------------------------------------

function SelectGroup({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}

function SelectLabel({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <MuiMenuItem
      disabled
      className={className}
      sx={{ opacity: 0.7, fontWeight: 600, fontSize: "0.75rem" }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </MuiMenuItem>
  );
}

function SelectSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <hr
      className={className}
      style={{
        margin: "4px 0",
        border: "none",
        borderTop: "1px solid",
        borderColor: "inherit",
      }}
      {...props}
    />
  );
}

function SelectScrollUpButton() {
  return null;
}
function SelectScrollDownButton() {
  return null;
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
