import { MapPin, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AVAILABILITY_TAG_LABELS, type UserStatus } from '@/hooks/useStatus';

interface StatusBarProps {
  status: UserStatus | null;
  /** Compact: single-line summary. Default: full row with tags + travel. */
  compact?: boolean;
  className?: string;
  /** Optional click handler — turns the bar into a button (edit-own-status). */
  onClick?: () => void;
}

function travelLabel(travel: UserStatus['travel']): string | null {
  if (!travel) return null;
  const place = travel.city_name ?? travel.note ?? null;
  if (!place) return null;
  if (!travel.until) return `Visiting ${place}`;
  try {
    const d = new Date(travel.until);
    const fmt = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `Visiting ${place} until ${fmt}`;
  } catch {
    return `Visiting ${place}`;
  }
}

export function StatusBar({ status, compact = false, className, onClick }: StatusBarProps) {
  if (!status) return null;

  const hasContent =
    status.dndActive ||
    status.emoji ||
    status.text ||
    status.tags.length > 0 ||
    status.travel;
  if (!hasContent) return null;

  const interactive = Boolean(onClick);
  const Wrapper: 'button' | 'div' = interactive ? 'button' : 'div';

  if (status.dndActive) {
    return (
      <Wrapper
        type={interactive ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-2 rounded-element border border-border px-2.5 py-1.5 text-sm text-muted-foreground',
          interactive && 'hover:bg-muted/40 transition-colors',
          className,
        )}
      >
        <Moon className="h-4 w-4" aria-hidden />
        <span>Do not disturb</span>
      </Wrapper>
    );
  }

  const travel = travelLabel(status.travel);

  if (compact) {
    const summary = [
      status.emoji && status.text ? `${status.emoji} ${status.text}` : status.emoji ?? status.text,
      travel,
    ]
      .filter(Boolean)
      .join(' · ');
    if (!summary) return null;
    return (
      <Wrapper
        type={interactive ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-2 text-sm text-foreground',
          interactive && 'hover:underline',
          className,
        )}
      >
        <span className="truncate">{summary}</span>
      </Wrapper>
    );
  }

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-container border border-border bg-card p-4 text-left',
        interactive && 'hover:bg-muted/30 transition-colors w-full',
        className,
      )}
    >
      {(status.emoji || status.text) && (
        <div className="flex items-center gap-2 text-base text-foreground">
          {status.emoji && <span className="text-xl leading-none">{status.emoji}</span>}
          {status.text && <span>{status.text}</span>}
        </div>
      )}
      {travel && (
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden />
          <span>{travel}</span>
        </div>
      )}
      {status.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {status.tags.map((t) => (
            <span
              key={t}
              className="rounded-badge border border-border px-2 py-0.5 text-13 text-muted-foreground"
            >
              {AVAILABILITY_TAG_LABELS[t as keyof typeof AVAILABILITY_TAG_LABELS] ?? t}
            </span>
          ))}
        </div>
      )}
    </Wrapper>
  );
}
