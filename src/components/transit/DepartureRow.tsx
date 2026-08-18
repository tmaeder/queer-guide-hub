import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from './RouteBullet';
import { StationRing } from './StationRing';

interface DepartureRowProps {
  type: string;
  time: string;
  title: string;
  status?: string;
  /** Marks the status with a pink station dot (never a colored status text —
   *  track color must not encode state through hue alone). */
  urgent?: boolean;
  /** Makes the whole row a click target, via an absolute overlay link — the
   *  same pattern NestedEntityCard uses. Omit for a row with no page behind it;
   *  the row then drops the overlay AND the lift, because lifting something
   *  unclickable promises an interaction that does not exist. */
  href?: string;
  className?: string;
}

/** Departure-board row: bullet · time · title · status. Events, milestones,
 *  group calendars, Pride week. */
export function DepartureRow({
  type,
  time,
  title,
  status,
  urgent,
  href,
  className,
}: DepartureRowProps) {
  return (
    <div
      className={cn(
        'relative grid grid-cols-[34px_76px_1fr_auto] items-center gap-2 bg-muted rounded-element px-2 py-2',
        href && 'card-lift-sm',
        className,
      )}
    >
      <RouteBullet type={type} size={30} />
      <span className="text-13 font-bold">{time}</span>
      <span className="truncate font-display text-15">{title}</span>
      {status ? (
        <span className="flex items-center gap-1 text-xs2 font-bold text-foreground">
          {urgent && <StationRing state="typed" track="pink" className="h-2 w-2" />}
          {status}
        </span>
      ) : (
        <span />
      )}
      {href && (
        <LocalizedLink to={href} aria-label={title} className="absolute inset-0 no-underline" />
      )}
    </div>
  );
}
