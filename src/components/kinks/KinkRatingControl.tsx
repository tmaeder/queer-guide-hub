import { Star, ThumbsUp, Sparkles, CircleDashed, X, Ban, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { KinkRatingValue, KinkSide } from '@/lib/kinks/types';

export const RATING_META: {
  value: KinkRatingValue;
  label: string;
  icon: typeof Star;
}[] = [
  { value: 'favorite', label: 'Favorite', icon: Star },
  { value: 'like', label: 'Like', icon: ThumbsUp },
  { value: 'curious', label: 'Curious', icon: Sparkles },
  { value: 'maybe', label: 'Maybe', icon: CircleDashed },
  { value: 'no', label: 'No', icon: X },
  { value: 'hard_limit', label: 'Hard limit', icon: Ban },
];

export const SIDE_LABEL: Record<KinkSide, string> = {
  general: '',
  giving: 'Giving',
  receiving: 'Receiving',
  self: 'On me',
  partner: 'On my partner',
  dominant: 'Dominant',
  submissive: 'Submissive',
};

interface KinkRatingControlProps {
  side: KinkSide;
  rating: KinkRatingValue | null;
  needsDiscussion: boolean;
  onRate: (rating: KinkRatingValue | null) => void;
  onToggleDiscussion: (flag: boolean) => void;
  size?: 'sm' | 'lg';
}

/**
 * One rating row for one axis side: 6-value segmented control + a
 * "talk about it first" flag (only meaningful on positive ratings).
 */
export function KinkRatingControl({
  side,
  rating,
  needsDiscussion,
  onRate,
  onToggleDiscussion,
  size = 'sm',
}: KinkRatingControlProps) {
  const positive = !!rating && rating !== 'no' && rating !== 'hard_limit';
  const btn = size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const icon = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <div className="flex items-center gap-2">
      {SIDE_LABEL[side] && (
        <span className="w-24 shrink-0 text-13 text-muted-foreground">{SIDE_LABEL[side]}</span>
      )}
      <div
        className="flex items-center gap-1"
        role="radiogroup"
        aria-label={SIDE_LABEL[side] || 'Rating'}
      >
        {RATING_META.map(({ value, label, icon: Icon }) => {
          const selected = rating === value;
          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  onClick={() => onRate(selected ? null : value)}
                  className={cn(
                    'inline-flex min-h-0 items-center justify-center rounded-element border transition-colors',
                    btn,
                    selected
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground',
                  )}
                >
                  <Icon className={icon} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {positive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={needsDiscussion}
              aria-label="Talk about it first"
              onClick={() => onToggleDiscussion(!needsDiscussion)}
              className={cn(
                'ml-1 inline-flex min-h-0 items-center justify-center rounded-element border transition-colors',
                btn,
                needsDiscussion
                  ? 'border-foreground bg-muted text-foreground'
                  : 'border-dashed border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground',
              )}
            >
              <MessageCircle className={icon} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Talk about it first</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
