import { useState, type ReactNode } from 'react';
import { EyeOff } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { PostModeration } from '@/lib/atprotoModeration';

/**
 * Renders a Bluesky moderation decision over media: blurred behind a text label
 * with a "Show" button, or locked when the decision says it may not be overridden
 * (adult content while the viewer has adult content off).
 */
export function ContentWarningGate({
  moderation,
  children,
}: {
  moderation?: PostModeration;
  children: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!moderation?.blurMedia || revealed) return <>{children}</>;

  const reason = moderation.reasons.join(' · ') || 'Content warning';
  return (
    <div className="relative overflow-hidden rounded-element">
      <div aria-hidden="true" inert className="pointer-events-none select-none blur-2xl">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-4 text-center">
        <p className="flex items-center gap-2 text-sm font-medium">
          <EyeOff size={16} aria-hidden="true" />
          {reason}
        </p>
        {moderation.noOverride ? (
          <p className="text-xs text-muted-foreground">
            Turn on adult content in Settings → Moderation to view.
          </p>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setRevealed(true)}>
            Show
          </Button>
        )}
      </div>
    </div>
  );
}
