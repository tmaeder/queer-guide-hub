import type { SVGProps } from 'react';
import { ICON_DEFS } from './iconDefs';
import { displaySize, paper } from './iconKit';
import { FILLABLE_ICONS, TRANSIT_ICON_PATHS, type TransitIconName } from './transitIconPaths';

interface TransitIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'color'> {
  name: TransitIconName;
  size?: number;
  /** Accessible label. Omit for decorative icons. */
  label?: string;
  /** Explicit ink for standalone artwork such as map markers. */
  color?: string;
  /** Outline treatment for the off state of a toggle. */
  hollow?: boolean;
}

const STROKE_WIDTH = 7.5;

export function TransitIcon({
  name,
  size = 24,
  label,
  color,
  hollow = false,
  ...rest
}: TransitIconProps) {
  const renderedSize = color ? size : displaySize(size);
  const stroke = {
    stroke: color || 'currentColor',
    strokeWidth: STROKE_WIDTH,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const pride = name === 'pride' && !color && !hollow;
  const selected = !color && !hollow && FILLABLE_ICONS.has(name);
  const def = ICON_DEFS[name];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={renderedSize}
      height={renderedSize}
      {...rest}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {pride &&
        def.f?.map(([d, fill, outline], index) => (
          <path
            key={index}
            d={d}
            fill={fill === 'T' ? def.hex : fill === 'P' ? paper : fill}
            {...(outline === 0 ? { stroke: 'none' } : stroke)}
          />
        ))}
      {!pride && (
        <path
          d={TRANSIT_ICON_PATHS[name]}
          fill={selected ? def.hex : 'none'}
          {...stroke}
        />
      )}
    </svg>
  );
}
