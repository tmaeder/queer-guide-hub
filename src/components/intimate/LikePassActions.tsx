import { Heart, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LikePassActionsProps {
  onLike: () => void;
  onPass: () => void;
  liked?: boolean;
  passed?: boolean;
  matched?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Compact action pair for discovery cards: Pass + Like.
 * Shows a "Matched" badge once the like is reciprocated.
 * Monochrome — emphasis via fill, not color.
 */
export function LikePassActions({
  onLike,
  onPass,
  liked,
  passed,
  matched,
  disabled,
  className,
}: LikePassActionsProps) {
  if (matched) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-badge border border-foreground bg-foreground px-3 py-1 text-13 text-background',
          className,
        )}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Matched
      </span>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPass();
        }}
        disabled={disabled || passed}
        aria-label={passed ? 'Already passed' : 'Pass'}
        className="rounded-element"
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant={liked ? 'default' : 'outline'}
        size="sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onLike();
        }}
        disabled={disabled || liked}
        aria-label={liked ? 'Already liked' : 'Like'}
        className="rounded-element"
      >
        <Heart className={cn('h-4 w-4', liked && 'fill-current')} aria-hidden />
      </Button>
    </div>
  );
}
