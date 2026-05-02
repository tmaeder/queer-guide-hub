import * as React from "react"
import MuiButton, { type ButtonProps as MuiButtonProps } from "@mui/material/Button"
import MuiIconButton from "@mui/material/IconButton"
import CircularProgress from "@mui/material/CircularProgress"
import { Slot } from "@radix-ui/react-slot"
import { motion, useReducedMotion } from "motion/react"
import { springs } from "@/lib/motion"

const MotionMuiButton = motion.create(MuiButton)
const MotionMuiIconButton = motion.create(MuiIconButton)
const MotionSlot = motion.create(Slot)

// Variant mapping: shadcn → MUI
type ShadcnVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "brand";
type ShadcnSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ShadcnVariant;
  size?: ShadcnSize;
  asChild?: boolean;
  /** P6-1 — show a spinner and block clicks. Width is preserved. */
  loading?: boolean;
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
    case "brand":
      return { muiVariant: "contained", muiColor: "brand" as MuiButtonProps["color"] };
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
  ({ className, variant = "default", size = "default", asChild = false, loading = false, children, style, disabled, ...props }, ref) => {
    const reduced = useReducedMotion();
    const isInert = disabled || loading;
    const motionInteractions = reduced || isInert
      ? {}
      : {
          whileTap: { opacity: 0.7 },
          transition: springs.snappy,
        };

    const renderContent = (node: React.ReactNode) =>
      loading ? (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
          <span style={{ visibility: "hidden", display: "inline-flex", alignItems: "center" }}>
            {node}
          </span>
          <CircularProgress
            size={16}
            color="inherit"
            sx={{ position: "absolute", left: "50%", top: "50%", marginLeft: "-8px", marginTop: "-8px" }}
          />
        </span>
      ) : (
        node
      );

    // asChild pattern: render children as the root element
    // This is used for <Button asChild><Link to="...">...</Link></Button>
    if (asChild) {
      return (
        <MotionSlot
          ref={ref as React.Ref<HTMLButtonElement>}
          className={className}
          style={style}
          {...motionInteractions}
          {...(props as Record<string, unknown>)}
        >
          {renderContent(children)}
        </MotionSlot>
      );
    }

    // Icon button — square with icon only
    if (size === "icon") {
      return (
        <MotionMuiIconButton
          ref={ref as React.Ref<HTMLButtonElement>}
          className={className}
          color={variant === "destructive" ? "error" : variant === "default" ? "primary" : "default"}
          disabled={isInert}
          aria-busy={loading || undefined}
          sx={{
            minWidth: 44,
            minHeight: 44,
            width: 44,
            height: 44,
          }}
          style={style}
          {...motionInteractions}
          {...(props as Record<string, unknown>)}
        >
          {renderContent(children)}
        </MotionMuiIconButton>
      );
    }

    const { muiVariant, muiColor } = mapVariantToMui(variant);
    const muiSize = mapSizeToMui(size);

    return (
      <MotionMuiButton
        ref={ref as React.Ref<HTMLButtonElement>}
        variant={muiVariant}
        color={muiColor}
        size={muiSize}
        className={className}
        style={style}
        disabled={isInert}
        aria-busy={loading || undefined}
        sx={{
          // Preserve existing icon sizing behavior
          '& svg': {
            width: 16,
            height: 16,
            flexShrink: 0,
            pointerEvents: 'none',
          },
        }}
        {...motionInteractions}
        {...(props as Record<string, unknown>)}
      >
        {renderContent(children)}
      </MotionMuiButton>
    );
  }
)
Button.displayName = "Button"

// Keep buttonVariants export for compatibility (some files import it)
const buttonVariants = (() => "") as unknown as Record<string, unknown>;

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
