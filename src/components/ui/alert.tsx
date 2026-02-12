import * as React from "react"
import MuiAlert from "@mui/material/Alert"
import AlertTitle from "@mui/material/AlertTitle"
import Typography from "@mui/material/Typography"

type AlertVariant = "default" | "destructive";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", children, style, ...props }, ref) => (
    <MuiAlert
      ref={ref}
      severity={variant === "destructive" ? "error" : "info"}
      variant="outlined"
      className={className}
      style={style}
      icon={false}
      sx={{ '& .MuiAlert-message': { width: '100%' } }}
      {...(props as any)}
    >
      {children}
    </MuiAlert>
  )
);
Alert.displayName = "Alert"

const AlertTitleComponent = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, style, ...props }, ref) => (
    <AlertTitle ref={ref as any} className={className} style={style} sx={{ fontWeight: 600, mb: 0.5 }} {...(props as any)}>
      {children}
    </AlertTitle>
  )
);
AlertTitleComponent.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, style, ...props }, ref) => (
    <Typography ref={ref} variant="body2" className={className} style={style} {...(props as any)}>
      {children}
    </Typography>
  )
);
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitleComponent as AlertTitle, AlertDescription }
