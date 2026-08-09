import { cn } from '@/lib/utils';
import { ROUTE_BULLET_MAP, TRACK_BG, TRACK_TEXT } from './routeBulletMap';

interface RouteBulletProps {
  type: string;
  /** Diameter in px; 38 is the standard row size, 30 for dense rows. */
  size?: number;
  className?: string;
}

/** NYC-style route bullet: letter = content type, color = its line. Falls
 *  back to an ink bullet for unmapped types so new entity types never crash.
 *  A 2px ink ring border-gates the fill (WCAG 1.4.11 — see tokenContrast). */
export function RouteBullet({ type, size = 38, className }: RouteBulletProps) {
  const def = ROUTE_BULLET_MAP[type];
  const bg = def ? TRACK_BG[def.track] : 'bg-foreground';
  const text = def ? TRACK_TEXT[def.track] : 'text-background';
  return (
    <span
      role="img"
      aria-label={def?.label ?? type}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full border-2 border-foreground font-bold',
        bg,
        text,
        className,
      )}
    >
      {def?.letter ?? type.charAt(0).toUpperCase()}
    </span>
  );
}
