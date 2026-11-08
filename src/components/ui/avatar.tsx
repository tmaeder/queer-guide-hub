import * as React from 'react';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

const AvatarContext = React.createContext<{
  status: Status;
  setStatus: (s: Status) => void;
}>({ status: 'idle', setStatus: () => {} });

const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    const [status, setStatus] = React.useState<Status>('idle');
    return (
      <AvatarContext.Provider value={{ status, setStatus }}>
        <span
          ref={ref}
          className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
          {...props}
        />
      </AvatarContext.Provider>
    );
  },
);
Avatar.displayName = 'Avatar';

/** Same contract as Radix Avatar: the <img> only mounts once it has loaded. */
const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, src, alt = '', referrerPolicy, crossOrigin, ...props }, ref) => {
    const { status, setStatus } = React.useContext(AvatarContext);

    React.useLayoutEffect(() => {
      if (!src) {
        setStatus('error');
        return;
      }
      let active = true;
      const img = new window.Image();
      setStatus('loading');
      img.onload = () => active && setStatus('loaded');
      img.onerror = () => active && setStatus('error');
      if (referrerPolicy) img.referrerPolicy = referrerPolicy;
      if (crossOrigin != null) img.crossOrigin = crossOrigin;
      img.src = src;
      return () => {
        active = false;
      };
    }, [src, referrerPolicy, crossOrigin, setStatus]);

    if (status !== 'loaded') return null;
    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        referrerPolicy={referrerPolicy}
        crossOrigin={crossOrigin}
        className={cn('aspect-square h-full w-full object-cover', className)}
        {...props}
      />
    );
  },
);
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { delayMs?: number }
>(({ className, delayMs, ...props }, ref) => {
  const { status } = React.useContext(AvatarContext);
  const [canRender, setCanRender] = React.useState(delayMs === undefined);

  React.useEffect(() => {
    if (delayMs === undefined) return;
    const t = window.setTimeout(() => setCanRender(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  if (!canRender || status === 'loaded') return null;
  return (
    <span
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-muted',
        className,
      )}
      {...props}
    />
  );
});
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback };
