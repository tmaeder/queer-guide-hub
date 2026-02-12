import * as React from "react"
import MuiAvatar from "@mui/material/Avatar"

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { className?: string }>(
  ({ className, children, style, ...props }, ref) => (
    <MuiAvatar
      ref={ref}
      className={className}
      style={style}
      sx={{ width: 40, height: 40, borderRadius: 1.25 }}
      {...(props as any)}
    >
      {children}
    </MuiAvatar>
  )
);
Avatar.displayName = "Avatar"

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, src, alt, style, ...props }, ref) => {
    if (!src) return null;
    return (
      <img
        ref={ref}
        src={src}
        alt={alt || ""}
        className={className}
        style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
        {...props}
      />
    );
  }
);
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, children, style, ...props }, ref) => (
    <span
      ref={ref}
      className={className}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  )
);
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
