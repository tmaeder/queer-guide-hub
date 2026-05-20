import { cn } from '@/lib/utils';

interface TextGenerateEffectProps {
  words?: string;
  text?: string;
  className?: string;
  filter?: boolean;
  duration?: number;
}

/**
 * Aceternity TextGenerateEffect — gutted to a static heading 2026-05-19.
 * The word-by-word reveal was decorative; the text is the message.
 */
export function TextGenerateEffect({ words, text, className }: TextGenerateEffectProps) {
  return <div className={cn(className)}>{words ?? text ?? ''}</div>;
}
