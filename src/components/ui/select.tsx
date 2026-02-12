import * as React from "react"
import MuiSelect, { type SelectChangeEvent } from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import FormControl from "@mui/material/FormControl"
import InputLabel from "@mui/material/InputLabel"

// Re-export compatible wrappers for the Radix Select API shape

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

const SelectContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
  disabled: boolean;
}>({
  value: "",
  onValueChange: () => {},
  disabled: false,
});

function Select({ children, value, defaultValue, onValueChange, disabled = false, ...props }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const currentValue = value !== undefined ? value : internalValue;

  const handleChange = React.useCallback((newValue: string) => {
    if (value === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  }, [value, onValueChange]);

  return (
    <SelectContext.Provider value={{ value: currentValue, onValueChange: handleChange, disabled }}>
      {children}
    </SelectContext.Provider>
  );
}

interface SelectTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  asChild?: boolean;
}

const SelectTrigger = React.forwardRef<HTMLDivElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { value, onValueChange, disabled } = React.useContext(SelectContext);

    // Collect SelectItem children from surrounding Select context
    // The actual MUI Select rendering happens here
    return (
      <FormControl
        size="small"
        fullWidth
        disabled={disabled}
        ref={ref as any}
        className={className}
      >
        <MuiSelect
          value={value}
          onChange={(e: SelectChangeEvent) => onValueChange(e.target.value)}
          displayEmpty
          sx={{
            borderRadius: 1.25,
            bgcolor: 'action.hover',
            '& .MuiSelect-select': {
              py: 1,
            },
          }}
          {...(props as any)}
        >
          {/* Items will be rendered via portal pattern */}
          {children}
        </MuiSelect>
      </FormControl>
    );
  }
);
SelectTrigger.displayName = "SelectTrigger"

// SelectValue — MUI Select handles value display internally, this is a no-op wrapper
interface SelectValueProps {
  placeholder?: string;
  children?: React.ReactNode;
}

function SelectValue({ placeholder }: SelectValueProps) {
  // MUI Select handles value display via renderValue or displayEmpty
  return null;
}

// SelectContent — MUI Select handles the dropdown internally, pass children through
interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  position?: string;
}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ children, ...props }, ref) => {
    // MUI Select handles the dropdown menu internally
    // This is a pass-through wrapper for API compatibility
    return <>{children}</>;
  }
);
SelectContent.displayName = "SelectContent"

// SelectItem → MUI MenuItem
interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, value, disabled, ...props }, ref) => {
    return (
      <MenuItem
        ref={ref as any}
        value={value}
        disabled={disabled}
        className={className}
        {...(props as any)}
      >
        {children}
      </MenuItem>
    );
  }
);
SelectItem.displayName = "SelectItem"

// SelectGroup — simple grouping wrapper
function SelectGroup({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}

// SelectLabel — group label
function SelectLabel({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <MenuItem disabled className={className} sx={{ opacity: 0.7, fontWeight: 600, fontSize: '0.75rem' }} {...(props as any)}>
      {children}
    </MenuItem>
  );
}

// SelectSeparator — divider between groups
function SelectSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <hr className={className} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid', borderColor: 'inherit' }} {...props} />;
}

// Scroll buttons — not needed in MUI (native scrolling)
function SelectScrollUpButton() { return null; }
function SelectScrollDownButton() { return null; }

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
