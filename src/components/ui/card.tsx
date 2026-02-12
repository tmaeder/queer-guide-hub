import * as React from "react"
import MuiCard from "@mui/material/Card"
import MuiCardContent from "@mui/material/CardContent"
import MuiCardHeader from "@mui/material/CardHeader"
import MuiCardActions from "@mui/material/CardActions"
import Typography from "@mui/material/Typography"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, style, ...props }, ref) => (
  <MuiCard
    ref={ref}
    className={className}
    style={style}
    variant="outlined"
    sx={{
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      '&:hover': {
        backdropFilter: 'blur(8px)',
      },
    }}
    {...(props as any)}
  >
    {children}
  </MuiCard>
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, style, ...props }, ref) => (
  <MuiCardHeader
    ref={ref as any}
    className={className}
    style={style}
    title={undefined}
    sx={{ pb: 0 }}
    component="div"
    {...(props as any)}
  >
    {/* MuiCardHeader doesn't render children the same way; use a wrapper */}
  </MuiCardHeader>
))
// Actually, MUI CardHeader uses title/subheader/action props, not children.
// We need to keep rendering children like shadcn does. Use a plain div with sx.
const CardHeaderCompat = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, style, ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: 24,
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
))
CardHeaderCompat.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, style, ...props }, ref) => (
  <Typography
    ref={ref}
    variant="h6"
    component="h3"
    className={className}
    style={style}
    sx={{
      fontWeight: 600,
      lineHeight: 1,
      letterSpacing: '-0.015em',
    }}
    {...(props as any)}
  >
    {children}
  </Typography>
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, style, ...props }, ref) => (
  <Typography
    ref={ref}
    variant="body2"
    color="text.secondary"
    className={className}
    style={style}
    {...(props as any)}
  >
    {children}
  </Typography>
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, style, ...props }, ref) => (
  <MuiCardContent
    ref={ref as any}
    className={className}
    style={style}
    sx={{ pt: 0, '&:last-child': { pb: 3 } }}
    {...(props as any)}
  >
    {children}
  </MuiCardContent>
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, style, ...props }, ref) => (
  <MuiCardActions
    ref={ref as any}
    className={className}
    style={style}
    sx={{ px: 3, pt: 0 }}
    {...(props as any)}
  >
    {children}
  </MuiCardActions>
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeaderCompat as CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
