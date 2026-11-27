/**
 * Geometry and route policy for the ground layer (TrackGround.tsx). Kept out
 * of the component file so it stays a components-only module.
 */
import { stripLocale } from '@/lib/locale';

/** viewBox 1600x900; every path starts at x=-240 and ends at x=1840. */
export const TRACK_GROUND_LINES = [
  {
    track: 'pink',
    d: 'M -240 200 C 120 150 340 420 700 410 C 1020 400 1200 120 1840 170',
  },
  {
    track: 'blue',
    d: 'M -240 480 C 220 420 460 250 760 268 C 1060 286 1240 580 1840 520',
  },
  {
    track: 'green',
    d: 'M -240 650 C 200 720 420 830 720 820 C 1020 810 1200 640 1840 700',
  },
  {
    track: 'yellow',
    d: 'M -240 790 C 300 860 560 700 880 716 C 1200 732 1360 850 1840 770',
  },
] as const;

/** Routes that must stay motion-free (CLAUDE.md: crisis & safety pages). */
/**
 * Long-form policy pages: the ground stays (it is what separates cards from the
 * page) but still and faint, so the lines do not run under paragraphs a reader
 * is working through.
 */
export function isQuietReadingRoute(pathname: string): boolean {
  return /^\/(?:privacy|terms|cookies|dmca|accessibility|legal)(?:\/|$)/.test(
    stripLocale(pathname),
  );
}

export function isMotionFreeRoute(pathname: string): boolean {
  const path = stripLocale(pathname);
  return /^\/(?:help|safety)(?:\/|$)/.test(path) || /^\/report-/.test(path);
}
