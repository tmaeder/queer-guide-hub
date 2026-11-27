/**
 * The ground layer: the four track colours drawn as bendy lines behind every
 * public page.
 *
 * It used to be a 1600x900 data-URI tile repeated on `body`, and that had two
 * defects. (1) LayoutShell paints an opaque `bg-background` root and a fixed
 * full-screen `bg-background` backdrop above `body`, so the tile was covered
 * on every page and only showed in the gaps of a route change. (2) The curves
 * did not meet at the tile edges (pink entered at y=170 and left at y=150,
 * yellow ran past the bottom edge), so wherever the tile did show, it repeated
 * with visible cuts.
 *
 * So it is no longer a tile. Each track is one SVG that is scaled to cover the
 * viewport (`preserveAspectRatio="xMidYMid slice"`) and whose path runs well
 * past both edges of the viewBox, so no edge of the drawing is ever on screen.
 * The layer is `position: fixed` — the content travels over it — which also
 * replaces `background-attachment: fixed` and its iOS repaint cost.
 *
 * Motion: each track drifts slowly on its own period. Every track is its own
 * <svg> element so the animation is a compositor-only `transform` on that
 * element; animating paths inside a single SVG would repaint a full-viewport
 * layer every frame. Motion is off when the visitor prefers reduced motion
 * (CSS media query in index.css), on low-end devices, and on crisis and safety
 * routes (/help, /safety, /report-*), which stay animation-free.
 *
 * Strokes take their colour from the track tokens in index.css, so branding
 * overrides from /admin/design reach the ground too. Every path bends — hard
 * rule #1, no straight runs.
 */
import { isLowEndDevice } from '@/lib/animation';
import { TRACK_GROUND_LINES, isMotionFreeRoute } from '@/lib/trackGround';

export function TrackGround({ pathname }: { pathname: string }) {
  const still = isMotionFreeRoute(pathname) || isLowEndDevice();
  return (
    <div
      aria-hidden="true"
      data-testid="track-ground"
      data-motion={still ? 'still' : 'drift'}
      className="track-ground"
    >
      {TRACK_GROUND_LINES.map(({ track, d }) => (
        <svg
          key={track}
          className={`track-ground-line track-ground-${track}`}
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <path d={d} />
        </svg>
      ))}
    </div>
  );
}
