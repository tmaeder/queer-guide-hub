import { cn } from '@/lib/utils';

interface WordRotateProps {
  words: string[];
  interval?: number;
  className?: string;
}

/**
 * Aceternity WordRotate — gutted 2026-05-19. Rotating word animation
 * removed; renders the first word as a static span.
 */
export function WordRotate({ words, className }: WordRotateProps) {
  return <span className={cn('inline-block whitespace-nowrap', className)}>{words[0] ?? ''}</span>;
}
