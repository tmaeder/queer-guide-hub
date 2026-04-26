import * as React from "react"
import Chip, { type ChipProps } from "@mui/material/Chip"

type ShadcnBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ShadcnBadgeVariant;
}

function mapVariant(variant: ShadcnBadgeVariant = "default"): {
  muiVariant: ChipProps["variant"];
  muiColor: ChipProps["color"];
} {
  switch (variant) {
    case "default":
      return { muiVariant: "filled", muiColor: "primary" };
    case "secondary":
      return { muiVariant: "filled", muiColor: "default" };
    case "destructive":
      return { muiVariant: "filled", muiColor: "error" };
    case "outline":
      return { muiVariant: "outlined", muiColor: "default" };
    default:
      return { muiVariant: "filled", muiColor: "primary" };
  }
}

function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  const { muiVariant, muiColor } = mapVariant(variant);

  return (
    <Chip
      label={children}
      variant={muiVariant}
      color={muiColor}
      size="small"
      className={className}
      sx={{
        fontWeight: 600,
        fontSize: '0.75rem',
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

// Keep badgeVariants export for compatibility
const badgeVariants = (() => "") as unknown as Record<string, unknown>;

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
