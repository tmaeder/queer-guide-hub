import * as React from "react"
import MuiAvatar from "@mui/material/Avatar"

type ImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

const AvatarContext = React.createContext<{
  status: ImageLoadingStatus;
  setStatus: (status: ImageLoadingStatus) => void;
}>({ status: 'idle', setStatus: () => {} });

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { className?: string }>(
  ({ className, children, style, ...props }, ref) => {
    const [status, setStatus] = React.useState<ImageLoadingStatus>('idle');
    return (
      <AvatarContext.Provider value={{ status, setStatus }}>
        <MuiAvatar
          ref={ref}
          className={className}
          style={style}
          sx={{ width: 40, height: 40, borderRadius: 1.25 }}
          {...(props as any)}
        >
          {children}
        </MuiAvatar>
      </AvatarContext.Provider>
    );
  }
);
Avatar.displayName = "Avatar"

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, src, alt, style, onLoad, onError, ...props }, ref) => {
    const { status, setStatus } = React.useContext(AvatarContext);
    const [hasError, setHasError] = React.useState(false);

    React.useEffect(() => {
      setHasError(false);
      if (src) {
        setStatus('loading');
      } else {
        setStatus('error');
      }
    }, [src, setStatus]);

    if (!src || hasError) return null;

    return (
      <img
        ref={ref}
        src={src}
        alt={alt || ""}
        className={className}
        style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
        onLoad={(e) => {
          setStatus('loaded');
          onLoad?.(e);
        }}
        onError={(e) => {
          setHasError(true);
          setStatus('error');
          onError?.(e);
        }}
        {...props}
      />
    );
  }
);
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, children, style, ...props }, ref) => {
    const { status } = React.useContext(AvatarContext);

    if (status === 'loaded') return null;

    return (
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
    );
  }
);
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
