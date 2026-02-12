import * as React from "react"
import MuiToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import MuiToggleButton from "@mui/material/ToggleButton"

type ToggleGroupVariant = "default" | "outline";
type ToggleGroupSize = "default" | "sm" | "lg";

interface ToggleGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "single" | "multiple";
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  variant?: ToggleGroupVariant;
  size?: ToggleGroupSize;
}

const ToggleGroupContext = React.createContext<{
  variant?: ToggleGroupVariant;
  size?: ToggleGroupSize;
}>({ variant: "default", size: "default" });

const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ className, type = "single", value, defaultValue, onValueChange, variant = "default", size = "default", children, style, ...props }, ref) => {
    const exclusive = type === "single";
    return (
      <ToggleGroupContext.Provider value={{ variant, size }}>
        <MuiToggleButtonGroup
          ref={ref as any}
          exclusive={exclusive}
          value={value ?? defaultValue}
          onChange={(_, newValue) => { if (newValue !== null) onValueChange?.(newValue); }}
          className={className}
          style={style}
          sx={{ gap: 0.5, '& .MuiToggleButtonGroup-grouped': { border: 0, borderRadius: '10px !important' } }}
          {...(props as any)}
        >
          {children}
        </MuiToggleButtonGroup>
      </ToggleGroupContext.Provider>
    );
  }
);
ToggleGroup.displayName = "ToggleGroup"

interface ToggleGroupItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
  variant?: ToggleGroupVariant;
  size?: ToggleGroupSize;
}

const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  ({ className, value, children, variant, size, style, ...props }, ref) => {
    const context = React.useContext(ToggleGroupContext);
    const finalVariant = variant || context.variant || "default";
    const finalSize = size || context.size || "default";
    const muiSize = finalSize === "sm" ? "small" : finalSize === "lg" ? "large" : "medium";
    return (
      <MuiToggleButton
        ref={ref}
        value={value}
        size={muiSize}
        className={className}
        style={style}
        sx={{
          textTransform: 'none',
          border: finalVariant === "outline" ? 1 : 0,
          borderColor: 'divider',
          color: 'text.secondary',
          '&.Mui-selected': { bgcolor: 'action.selected', color: 'text.primary' },
          '&:hover': { bgcolor: 'action.hover' },
        }}
        {...(props as any)}
      >
        {children}
      </MuiToggleButton>
    );
  }
);
ToggleGroupItem.displayName = "ToggleGroupItem"

export { ToggleGroup, ToggleGroupItem }
