import {
  ICON_DEFS,
  TICKS,
  TICK_WEIGHT,
  ink,
  inkPathOf,
  paper,
  strokeWidthFor,
  type FillKind,
  type Stroke,
} from './iconDefs';
import type { TransitIconName } from './transitIconPaths';

interface TransitIconProps {
  name: TransitIconName;
  /** Rendered box in px. Stroke weight bumps one step below 32px, and motion
   *  ticks drop out entirely below it (Icon System §5). */
  size?: number;
  /** Accessible label. Omitted = decorative (aria-hidden). */
  label?: string;
  className?: string;
  /**
   * Render the icon MONOCHROME in this colour instead of in its own track
   * colour: fills become hollow, every stroke takes this value, and ticks are
   * suppressed.
   *
   * Two callers need it and both need it for the same reason — the icon has to
   * read against a ground the icon system does not control. The map draws
   * glyphs inside pins that are ALREADY the layer's track colour, where a
   * track-coloured glyph would be invisible and where ink-on-track is a
   * measured contrast fix (5.22 pink … 13.15 yellow); `public/favicon.svg` is
   * one file serving a 16px browser tab and a 512px app icon.
   *
   * Ink or paper only. A track colour here would put the colour where the
   * outline belongs, which §4b forbids.
   */
  color?: string;
  /**
   * Suppress motion ticks regardless of size.
   *
   * For a glyph drawn INSIDE another shape — the marketplace department plate
   * sets its mark in a station disc — the containing shape is the boundary, so
   * the 8-unit tick margin is inside the disc rather than outside the icon.
   * Ticks there do not read as motion, they read as marks on the disc. Size
   * cannot express this: the plate's glyph is large in user units and small on
   * screen.
   */
  ticks?: boolean;
}

/** Resolve `"T"` / `"P"` / a literal track colour against this icon's own hex. */
function fillOf(kind: FillKind, hex: string): string {
  if (kind === 'T') return hex;
  if (kind === 'P') return paper;
  return kind;
}

/** Normalise the three stroke forms of §2 into one shape. */
function strokeOf(s: Stroke, hex: string): { d: string; color: string; weight: number } {
  if (typeof s === 'string') return { d: s, color: ink, weight: 1 };
  const [d, c, weight] = s;
  const color = c === null ? ink : c === 'T' ? hex : c === 'P' ? paper : c;
  return { d, color, weight };
}

/**
 * Wayfinding and content icon. Filled shapes with an ink outline and one track
 * colour inside, open strokes over the top, motion ticks in the margin.
 *
 * One viewBox, `0 0 100 100`, in both modes — see the note on `viewBox` below
 * for why the spec's 8-unit bleed is not applied. Ticks appear and disappear in
 * the margin the body already leaves them, so the drawing never rescales under
 * them.
 */
export function TransitIcon({
  name,
  size = 24,
  label,
  className,
  color,
  ticks: showTicks = true,
}: TransitIconProps) {
  const def = ICON_DEFS[name];
  const mono = Boolean(color);
  // ONE viewBox, and the 8-unit bleed the spec describes is NOT needed.
  //
  // §3 reserves 0-12 and 88-100 for motion ticks — a margin INSIDE the
  // 100-unit box, not outside it — and every tick in `TICKS` is drawn there
  // (2..11 and 89..98), which the spec test asserts. Rendering into
  // `-8 -8 116 116` to "make room" therefore reserved space twice and drew
  // every icon at 86% of the size the same `size` prop used to produce. It
  // also forced the stroke to be scaled by the same factor to keep its
  // apparent weight, which is why the set looked thin.
  const viewBox = '0 0 100 100';
  const sw = strokeWidthFor(size);
  const ticks = !mono && showTicks && def.t !== 'none' && size >= 32 ? TICKS[def.t] : [];

  // Monochrome renders the DEDUPED flat path as a single element, not the
  // layered shapes recoloured. Recolouring them draws both halves of every
  // ink-under / colour-over pair, which strokes the glyph at 2.2× and 1.1× of
  // the base weight on top of each other — so a line drawing comes out visibly
  // fatter than the rest of the set, in exactly the two callers (20px map pin,
  // 16px tab) with the least room for it.
  if (mono) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        width={size}
        height={size}
        className={className}
        {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      >
        <path
          d={inkPathOf(def)}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      // Explicit namespace. Inline in a document React supplies it implicitly,
      // but the map serialises this component on its own with
      // `renderToStaticMarkup` and loads the result as a data-URI image — and
      // a standalone SVG document without xmlns fails to decode. Measured: the
      // browser fired `onerror` on every glyph, and because the rasterizer
      // fails soft (a missing glyph just leaves the coloured pin) the map lost
      // every category icon silently.
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size}
      height={size}
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {/* Fills first, back to front: a later shape paints over an earlier one,
          which is how a paper counter cuts a hole in a track-coloured mass —
          and, at outline weight 0, how a band of pure colour lands inside one
          keyline instead of carrying its own. `stroke="none"` rather than a
          zero width because a zero-width stroke still joins and caps. */}
      {(def.f ?? []).map(([d, kind, outline = 1], i) => (
        <path
          key={`f${i}`}
          d={d}
          fill={fillOf(kind, def.hex)}
          {...(outline === 0
            ? { stroke: 'none' }
            : {
                stroke: ink,
                strokeWidth: sw * outline,
                strokeLinecap: 'round' as const,
                strokeLinejoin: 'round' as const,
              })}
        />
      ))}
      {(def.l ?? []).map((s, i) => {
        const { d, color: c, weight } = strokeOf(s, def.hex);
        return (
          <path
            key={`l${i}`}
            d={d}
            fill="none"
            stroke={c}
            strokeWidth={sw * weight}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {/* Ticks are INK, never a track colour: §4b lets colour inside an outline
          or on a stroke that has an ink stroke under it, and a tick is neither.
          They are shared geometry per tick set, so two icons that radiate tick
          identically. */}
      {ticks.map((d, i) => (
        <path
          key={`t${i}`}
          d={d}
          fill="none"
          stroke={ink}
          strokeWidth={sw * TICK_WEIGHT}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
