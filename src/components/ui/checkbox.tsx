import * as React from "react"
import MuiCheckbox from "@mui/material/Checkbox"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked, defaultChecked, onCheckedChange, disabled, id, ...props }, ref) => {
    return (
      <MuiCheckbox
        ref={ref as React.Ref<HTMLButtonElement>}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        disabled={disabled}
        id={id}
        className={className}
        size="small"
        color="primary"
        sx={{
          width: 20,
          height: 20,
          p: 0,
          borderRadius: 0.5,
        }}
        {...(props as Record<string, unknown>)}
      />
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
