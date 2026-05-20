import { cn } from '@/lib/utils';

interface ColourfulTextProps {
  text: string;
  className?: string;
  interval?: number;
}

/**
 * Aceternity ColourfulText — gutted 2026-05-19. Letter-cycling animation
 * removed; renders the static text. Strictly monochrome — typography
 * carries the emphasis.
 */
export function ColourfulText({ text, className }: ColourfulTextProps) {
  return <span className={cn('inline-flex', className)}>{text}</span>;
}
