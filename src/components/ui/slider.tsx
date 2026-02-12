import * as React from "react"
import MuiSlider from "@mui/material/Slider"

interface SliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, value, defaultValue, onValueChange, min, max, step, disabled, ...props }, ref) => {
    return (
      <MuiSlider
        ref={ref as any}
        value={value}
        defaultValue={defaultValue}
        onChange={(_, newValue) => onValueChange?.(Array.isArray(newValue) ? newValue : [newValue])}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={className}
        color="primary"
        size="small"
        {...(props as any)}
      />
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
