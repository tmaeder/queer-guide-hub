import { cn } from '@/lib/utils';
import { ROUTE_BULLET_MAP, TRACK_BG, TRACK_TEXT, type Track } from './routeBulletMap';

interface RouteBulletProps {
  type: string;
  /** Diameter in px; 38 is the standard row size, 30 for dense rows. */
  size?: number;
  className?: string;
  /** Override the map's letter. For lines that are not entity types. */
  letter?: string;
  /** Override the map's track. `'ink'` renders the unmapped ink bullet. */
  track?: Track | 'ink';
  /** Override the map's accessible label. */
  label?: string;
  /** Which surface the bullet sits on. `ink` reverses the ring, and the
   *  unmapped/ink bullet inverts so it stays legible on an ink plate. */
  tone?: 'paper' | 'ink';
}

/** NYC-style route bullet: letter = content type, color = its line. Falls
 *  back to an ink bullet for unmapped types so new entity types never crash.
 *  A 2px ink ring border-gates the fill (WCAG 1.4.11 — see tokenContrast).
 *
 *  `letter`/`track`/`label` bypass ROUTE_BULLET_MAP for lines that are not
 *  entities. The policy pages are why: they need bullets, but that map is
 *  keyed to the `search_documents` entity vocab AND is the source of truth for
 *  the map layer colours (`mapPalette.test.ts`), so adding a Terms line would
 *  both pollute the vocab and collide — `T`-blue is already `trip` and
 *  `C`-yellow is already `country`. */
export function RouteBullet({
  type,
  size = 38,
  className,
  letter,
  track,
  label,
  tone = 'paper',
}: RouteBulletProps) {
  const def = ROUTE_BULLET_MAP[type];
  const resolved = track ?? def?.track;
  const useInk = resolved === undefined || resolved === 'ink';
  const onInk = tone === 'ink';
  // The achromatic bullet inverts with the plate; a track bullet never does —
  // its fill already clears both surfaces and flipping it would break the
  // line-colour contract that ROUTE_BULLET_MAP exists to hold.
  const bg = useInk ? (onInk ? 'bg-background' : 'bg-foreground') : TRACK_BG[resolved];
  const text = useInk ? (onInk ? 'text-foreground' : 'text-background') : TRACK_TEXT[resolved];
  return (
    <span
      role="img"
      aria-label={label ?? def?.label ?? type}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full border-2 font-bold',
        onInk ? 'border border-background' : 'border-track-ring',
        bg,
        text,
        className,
      )}
    >
      {letter ?? def?.letter ?? type.charAt(0).toUpperCase()}
    </span>
  );
}
