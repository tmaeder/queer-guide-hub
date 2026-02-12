import * as React from "react"
import MuiButton, { type ButtonProps as MuiButtonProps } from "@mui/material/Button"
import MuiIconButton from "@mui/material/IconButton"
import { Slot } from "@radix-ui/react-slot"

// Variant mapping: shadcn → MUI
type ShadcnVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type ShadcnSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ShadcnVariant;
  size?: ShadcnSize;
  asChild?: boolean;
}

function mapVariantToMui(variant: ShadcnVariant = "default"): {
  muiVariant: MuiButtonProps["variant"];
  muiColor: MuiButtonProps["color"];
} {
  switch (variant) {
    case "default":
      return { muiVariant: "contained", muiColor: "primary" };
    case "destructive":
      return { muiVariant: "contained", muiColor: "error" };
    case "outline":
      return { muiVariant: "outlined", muiColor: "inherit" };
    case "secondary":
      return { muiVariant: "contained", muiColor: "secondary" };
    case "ghost":
      return { muiVariant: "text", muiColor: "inherit" };
    case "link":
      return { muiVariant: "text", muiColor: "primary" };
    default:
      return { muiVariant: "contained", muiColor: "primary" };
  }
}

function mapSizeToMui(size: ShadcnSize = "default"): MuiButtonProps["size"] {
  switch (size) {
    case "sm": return "small";
    case "lg": return "large";
    case "default": return "medium";
    case "icon": return "medium";
    default: return "medium";
  }
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, children, style, ...props }, ref) => {
    // asChild pattern: render children as the root element
    // This is used for <Button asChild><Link to="...">...</Link></Button>
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={className}
          style={style}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    // Icon button — square with icon only
    if (size === "icon") {
      return (
        <MuiIconButton
          ref={ref}
          className={className}
          color={variant === "destructive" ? "error" : variant === "default" ? "primary" : "default"}
          sx={{
            width: 40,
            height: 40,
          }}
          style={style}
          {...(props as any)}
        >
          {children}
        </MuiIconButton>
      );
    }

    const { muiVariant, muiColor } = mapVariantToMui(variant);
    const muiSize = mapSizeToMui(size);

    return (
      <MuiButton
        ref={ref}
        variant={muiVariant}
        color={muiColor}
        size={muiSize}
        className={className}
        style={style}
        sx={{
          // Preserve existing icon sizing behavior
          '& svg': {
            width: 16,
            height: 16,
            flexShrink: 0,
            pointerEvents: 'none',
          },
        }}
        {...(props as any)}
      >
        {children}
      </MuiButton>
    );
  }
)
Button.displayName = "Button"

// Keep buttonVariants export for compatibility (some files import it)
const buttonVariants = (() => "") as any;

export { Button, buttonVariants }
