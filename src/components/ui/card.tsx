import * as React from "react"
import MuiCard from "@mui/material/Card"
import MuiCardContent from "@mui/material/CardContent"
import MuiCardHeader from "@mui/material/CardHeader"
import MuiCardActions from "@mui/material/CardActions"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"
import { useTheme } from "@mui/material/styles"
import type { LucideIcon } from "lucide-react"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, style, hoverable, ...props }, ref) => (
    <MuiCard
      ref={ref}
      className={className}
      style={style}
      variant="outlined"
      sx={{
        transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        bgcolor: 'background.paper',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        '&:hover': {
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        },
        ...(hoverable && {
          cursor: 'pointer',
          '&:hover': {
            transform: 'translateY(-3px)',
            boxShadow: 3,
          },
          '&:hover img': {
            transform: 'scale(1.03)',
          },
          '&:active': {
            transform: 'translateY(-1px)',
          },
        }),
      }}
      {...(props as any)}
    >
      {children}
    </MuiCard>
  )
)
Card.displayName = "Card"

/* ── CardImage ──────────────────────────────────────────────────────── */

interface CardImageProps {
  src?: string | null;
  alt: string;
  height?: number;
  fallbackIcon?: LucideIcon;
  children?: React.ReactNode;
}

const CardImage: React.FC<CardImageProps> = ({
  src,
  alt,
  height = 200,
  fallbackIcon: FallbackIcon,
  children,
}) => {
  const [error, setError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const theme = useTheme();
  const brandColor = theme.palette.brand?.main || '#DB2777';

  if (!src || error) {
    return (
      <Box
        sx={{
          height,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {FallbackIcon && (
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: `${brandColor}12`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FallbackIcon
              style={{ width: 28, height: 28, color: brandColor, opacity: 0.5 }}
              aria-hidden="true"
            />
          </Box>
        )}
        {children}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', height, overflow: 'hidden' }}>
      <Box
        component="img"
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`img-lazy-fade${loaded ? ' loaded' : ''}`}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
      {children}
    </Box>
  );
};
CardImage.displayName = "CardImage"

/* ── Other card sub-components ─────────────────────────────────────── */

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

export { Card, CardImage, CardHeaderCompat as CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
