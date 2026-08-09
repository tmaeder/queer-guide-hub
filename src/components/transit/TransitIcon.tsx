import { TRANSIT_ICON_PATHS, type TransitIconName } from './transitIconPaths';

interface TransitIconProps {
  name: TransitIconName;
  /** Rendered box in px. Stroke weight bumps one step below 32px (Icon System usage rule). */
  size?: number;
  /** Accessible label. Omitted = decorative (aria-hidden). */
  label?: string;
  className?: string;
}

/** Wayfinding icon: stroke-only, currentColor, round caps. Ink on paper /
 *  paper on ink only — never track colors. */
export function TransitIcon({ name, size = 24, label, className }: TransitIconProps) {
  const strokeWidth = size >= 32 ? 9 : size >= 24 ? 10 : 11;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
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
