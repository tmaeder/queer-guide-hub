import * as React from "react"
import MuiToggleButton from "@mui/material/ToggleButton"

type ToggleVariant = "default" | "outline";
type ToggleSize = "default" | "sm" | "lg";

interface ToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  variant?: ToggleVariant;
  size?: ToggleSize;
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  value?: string;
}

const toggleVariants = (opts?: { variant?: ToggleVariant; size?: ToggleSize }) => "";

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, variant = "default", size = "default", pressed, onPressedChange, children, value, style, ...props }, ref) => {
    const muiSize = size === "sm" ? "small" : size === "lg" ? "large" : "medium";
    return (
      <MuiToggleButton
        ref={ref}
        value={value || "toggle"}
        selected={pressed}
        onChange={() => onPressedChange?.(!pressed)}
        size={muiSize}
        className={className}
        style={style}
        sx={{
          textTransform: 'none',
          border: variant === "outline" ? 1 : 0,
          borderColor: 'divider',
          borderRadius: 1.25,
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
Toggle.displayName = "Toggle"

export { Toggle, toggleVariants }
