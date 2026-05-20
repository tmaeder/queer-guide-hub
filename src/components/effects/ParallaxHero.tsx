import { cn } from '@/lib/utils';

interface ParallaxHeroProps {
  children: React.ReactNode;
  className?: string;
  overlayFrom?: number;
  overlayTo?: number;
}

/**
 * Aceternity ParallaxHero — gutted 2026-05-19. Scroll-driven scale +
 * darkening overlay removed; renders a plain relative+overflow-hidden
 * container. Detail pages keep their existing hero layout unchanged.
 */
export function ParallaxHero({ children, className }: ParallaxHeroProps) {
  return <div className={cn('relative overflow-hidden', className)}>{children}</div>;
}
