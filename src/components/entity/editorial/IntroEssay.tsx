import { cn } from '@/lib/utils';

export interface IntroEssayProps {
  text: string | null | undefined;
  byline?: string;
  updatedAt?: string;
  className?: string;
}

export function IntroEssay({ text, byline, updatedAt, className }: IntroEssayProps) {
  if (!text || !text.trim()) return null;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className={cn('max-w-prose', className)}>
      <p className="text-title leading-snug text-foreground">{paragraphs[0]}</p>
      {paragraphs.slice(1).map((p, i) => (
        <p key={i} className="mt-4 text-body-lg leading-relaxed text-foreground/90">
          {p}
        </p>
      ))}
      {(byline || updatedAt) ? (
        <p className="mt-6 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {byline}
          {byline && updatedAt ? ' · ' : null}
          {updatedAt}
        </p>
      ) : null}
    </div>
  );
}
