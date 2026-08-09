import { cn } from '@/lib/utils';
import { TRACK_BG, type Track } from './routeBulletMap';

interface StationRingProps {
  /** open = place · typed = typed entity (needs track) · done = done/past */
  state: 'open' | 'typed' | 'done';
  track?: Track;
  className?: string;
}

/** Map station marker: 18px circle, 3px ink ring. */
export function StationRing({ state, track = 'pink', className }: StationRingProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-4 w-4 rounded-full border-[3px] border-foreground',
        state === 'open' && 'bg-background',
        state === 'typed' && TRACK_BG[track],
        state === 'done' && 'bg-foreground',
        className,
      )}
    />
  );
}
