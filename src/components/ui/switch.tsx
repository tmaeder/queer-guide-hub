import * as React from "react"
import MuiSwitch from "@mui/material/Switch"

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, defaultChecked, onCheckedChange, disabled, id, ...props }, ref) => {
    return (
      <MuiSwitch
        ref={ref as any}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        disabled={disabled}
        id={id}
        className={className}
        size="small"
        color="primary"
        {...(props as any)}
      />
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
