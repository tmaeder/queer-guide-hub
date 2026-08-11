import { TRANSIT_ICON_PATHS, type TransitIconName } from './transitIconPaths';

interface TransitIconProps {
  name: TransitIconName;
  /** Rendered box in px. Stroke weight bumps one step below 32px (Icon System usage rule). */
  size?: number;
  /** Accessible label. Omitted = decorative (aria-hidden). */
  label?: string;
  className?: string;
  /**
   * Explicit stroke colour. Normally you want `currentColor` (the default) and
   * should colour the icon via CSS on an ancestor — this exists for the map,
   * which serialises the icon standalone with `renderToStaticMarkup` into a
   * data-URI, where there is no ancestor to inherit from. Ink or paper only;
   * never a track colour.
   */
  color?: string;
}

/** Wayfinding icon: stroke-only, currentColor, round caps. Ink on paper /
 *  paper on ink only — never track colors. */
export function TransitIcon({ name, size = 24, label, className, color }: TransitIconProps) {
  const strokeWidth = size >= 32 ? 9 : size >= 24 ? 10 : 11;
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
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      {...(color ? { style: { color } } : {})}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path
        d={TRANSIT_ICON_PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
