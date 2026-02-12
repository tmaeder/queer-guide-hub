import * as React from "react"
import MuiRadioGroup from "@mui/material/RadioGroup"
import MuiRadio from "@mui/material/Radio"
import MuiFormControlLabel from "@mui/material/FormControlLabel"

interface RadioGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, defaultValue, onValueChange, disabled, children, ...props }, ref) => {
    return (
      <MuiRadioGroup
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onValueChange?.(e.target.value)}
        className={className}
        {...(props as any)}
      >
        {children}
      </MuiRadioGroup>
    )
  }
)
RadioGroup.displayName = "RadioGroup"

interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  id?: string;
}

const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ className, value, id, ...props }, ref) => {
    return (
      <MuiRadio
        ref={ref as any}
        value={value}
        id={id}
        className={className}
        size="small"
        color="primary"
        sx={{
          width: 20,
          height: 20,
          p: 0,
        }}
        {...(props as any)}
      />
    )
  }
)
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
