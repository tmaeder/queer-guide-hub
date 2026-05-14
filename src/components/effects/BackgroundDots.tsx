import { cn } from '@/lib/utils';

interface BackgroundDotsProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dotSize?: number;
  dotSpacing?: number;
  fade?: boolean;
}

export function BackgroundDots({
  children,
  className,
  style: containerStyle,
  dotSize = 1,
  dotSpacing = 20,
  fade = true,
}: BackgroundDotsProps) {
  return (
    <div className={cn('relative', className)} style={containerStyle}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(hsl(var(--foreground) / 0.07) ${dotSize}px, transparent ${dotSize}px)`,
          backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
          ...(fade
            ? {
                maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
              }
            : {}),
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
