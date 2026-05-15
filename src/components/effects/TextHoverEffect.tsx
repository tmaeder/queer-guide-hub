import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface TextHoverEffectProps {
  text: string;
  duration?: number;
  className?: string;
}

/**
 * Aceternity-style TextHoverEffect — SVG stroked text that reveals a
 * solid-fill version under a circular cursor-tracking mask. Monochrome.
 */
export function TextHoverEffect({ text, duration = 0.2, className }: TextHoverEffectProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [cursor, setCursor] = React.useState({ x: 0, y: 0 });
  const [hovered, setHovered] = React.useState(false);
  const [maskPos, setMaskPos] = React.useState({ cx: '50%', cy: '50%' });

  React.useEffect(() => {
    if (svgRef.current && cursor.x !== null && cursor.y !== null) {
      const rect = svgRef.current.getBoundingClientRect();
      const cx = ((cursor.x - rect.left) / rect.width) * 100;
      const cy = ((cursor.y - rect.top) / rect.height) * 100;
      setMaskPos({ cx: `${cx}%`, cy: `${cy}%` });
    }
  }, [cursor]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 300 100"
      preserveAspectRatio="xMidYMid meet"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      className={cn('select-none', className)}
      aria-label={text}
    >
      <defs>
        <radialGradient id="text-hover-grad" cx="50%" cy="50%" r="20%" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(var(--foreground))" />
          <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
        </radialGradient>
        <motion.radialGradient
          id="text-hover-reveal"
          gradientUnits="userSpaceOnUse"
          r="20%"
          animate={{ cx: maskPos.cx, cy: maskPos.cy }}
          transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </motion.radialGradient>
        <mask id="text-hover-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="black" />
          <rect x="0" y="0" width="100%" height="100%" fill="url(#text-hover-reveal)" />
        </mask>
      </defs>
      {/* Stroked outline — always visible */}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth="0.6"
        stroke="hsl(var(--foreground) / 0.6)"
        fill="transparent"
        style={{ fontSize: 60, fontWeight: 800, letterSpacing: '-0.04em' }}
        strokeDasharray={hovered ? 0 : 4}
      >
        {text}
      </text>
      {/* Filled version — revealed under cursor mask */}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="hsl(var(--foreground))"
        mask="url(#text-hover-mask)"
        style={{ fontSize: 60, fontWeight: 800, letterSpacing: '-0.04em' }}
      >
        {text}
      </text>
    </svg>
  );
}
