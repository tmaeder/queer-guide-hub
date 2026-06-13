import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { CompletionRing } from '@/components/profile/CompletionRing';
import { cn } from '@/lib/utils';

interface CompletionNudgeProps {
  percent: number;
  /** Auto-hide threshold. Default: 80%. */
  threshold?: number;
  className?: string;
}

/**
 * Renders a polite nudge banner inviting the user to keep filling their
 * profile. Auto-hides when percent >= threshold (default 80%).
 *
 * Pure presentational — copy is direct and factual per design system rules
 * (no "discover / unlock / journey" verbs).
 */
export function CompletionNudge({ percent, threshold = 80, className }: CompletionNudgeProps) {
  if (percent >= threshold) return null;
  return (
    <LocalizedLink
      to="/settings"
      className={cn(
        'flex items-center gap-4 rounded-container border border-border bg-card p-4 hover:bg-muted/30 transition-colors',
        className,
      )}
      aria-label={`Profile ${Math.round(percent)}% complete — continue setup`}
    >
      <CompletionRing percent={percent} size={56} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Finish your profile</p>
        <p className="text-13 text-muted-foreground">
          A fuller profile shows you up in friend suggestions, group invites, and discovery.
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </LocalizedLink>
  );
}
