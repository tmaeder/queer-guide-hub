import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TierUpgradeOverlayProps {
  open: boolean;
  tierName: string;
  tagline?: string;
  icon?: React.ReactNode;
  onDismiss?: () => void;
  /** Auto-dismiss timeout in ms. Default 4200ms; pass 0 to disable. */
  autoDismissMs?: number;
}

const SPARKLE_COUNT = 8;

/**
 * Full-screen celebration moment when user advances a trust tier.
 * Scales in the tier badge, fans out sparkle particles, auto-dismisses.
 * CSS-only (`tier-*` keyframes in index.css) — no framer; dismiss unmounts
 * instantly instead of playing an exit animation.
 */
export function TierUpgradeOverlay({
  open,
  tierName,
  tagline,
  icon,
  onDismiss,
  autoDismissMs = 4200,
}: TierUpgradeOverlayProps) {
  React.useEffect(() => {
    if (!open || !autoDismissMs) return;
    const id = setTimeout(() => onDismiss?.(), autoDismissMs);
    return () => clearTimeout(id);
  }, [open, autoDismissMs, onDismiss]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="tier-overlay fixed inset-0 z-[1300] flex items-center justify-center bg-background/85"
      role="dialog"
      aria-modal="true"
      aria-label={`Tier upgrade: ${tierName}`}
    >
      {/* Backdrop dismiss target — a real button so the click handler lives on
          an interactive element (a11y) rather than the dialog container. */}
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 cursor-default"
        onClick={onDismiss}
      />

      {/* Sparkle particles */}
      {Array.from({ length: SPARKLE_COUNT }).map((_, i) => {
        const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
        const distance = 180;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        return (
          <span
            key={i}
            aria-hidden
            className="tier-sparkle pointer-events-none absolute text-foreground"
            style={
              {
                '--dx': `${dx}px`,
                '--dy': `${dy}px`,
                animationDelay: `${300 + i * 40}ms`,
              } as React.CSSProperties
            }
          >
            <Sparkles size={14} />
          </span>
        );
      })}

      <div className="tier-card relative flex flex-col items-center text-center max-w-sm px-8">
        <div
          className={cn(
            'tier-badge relative mb-6 flex h-24 w-24 items-center justify-center',
            'bg-foreground text-background rounded-full',
          )}
        >
          {icon ?? <Sparkles size={42} />}
          <span
            aria-hidden
            className="tier-ring absolute inset-0 rounded-full border-2 border-foreground"
          />
        </div>

        <p
          className="tier-rise text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2"
          style={{ animationDelay: '500ms' }}
        >
          Tier unlocked
        </p>
        <h2
          className="tier-rise text-4xl font-bold tracking-tight mb-4"
          style={{ animationDelay: '600ms' }}
        >
          {tierName}
        </h2>
        {tagline && (
          <p
            className="tier-rise text-sm text-muted-foreground leading-relaxed mb-8"
            style={{ animationDelay: '700ms' }}
          >
            {tagline}
          </p>
        )}
        <div className="tier-rise" style={{ animationDelay: '900ms' }}>
          <Button onClick={onDismiss} variant="default">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
