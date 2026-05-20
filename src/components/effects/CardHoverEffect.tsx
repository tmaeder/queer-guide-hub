import { cn } from '@/lib/utils';

interface CardHoverEffectProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Monochrome card hover: border darkens on hover. No tilt, no spotlight,
 * no decorative motion. The decorative 3D variant was removed
 * 2026-05-19 (refactor/monochrome-2026). Kept as a named wrapper so the
 * intent ("interactive card") stays visible at consumer sites.
 */
export function CardHoverEffect({ children, className }: CardHoverEffectProps) {
  return (
    <div
      className={cn(
        'relative border border-border transition-colors hover:border-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}
