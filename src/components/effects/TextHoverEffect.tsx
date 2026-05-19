import { cn } from '@/lib/utils';

interface TextHoverEffectProps {
  text: string;
  className?: string;
  duration?: number;
}

export function TextHoverEffect({ text, className }: TextHoverEffectProps) {
  return <div className={cn(className)}>{text}</div>;
}
