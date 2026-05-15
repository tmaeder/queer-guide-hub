// Placeholder line-art pictograms for the intimate-profile add-on.
// Monochrome, currentColor stroke. v1 — replace with commissioned art before launch.

import type { SVGProps } from 'react';

type Picto = (p: SVGProps<SVGSVGElement>) => JSX.Element;

const base = (children: JSX.Element, props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

// ---------------- Genital pictograms ----------------

export const penisPictograms: Record<string, Picto> = {
  'penis-1': (p) => base(<><ellipse cx="32" cy="48" rx="10" ry="8" /><path d="M32 40 V14 a4 4 0 0 1 8 0" /></>, p),
  'penis-2': (p) => base(<><ellipse cx="32" cy="48" rx="11" ry="7" /><path d="M32 41 V12" /><circle cx="32" cy="10" r="4" /></>, p),
  'penis-3': (p) => base(<><ellipse cx="32" cy="48" rx="9" ry="9" /><path d="M30 39 V16 c0 -4 6 -4 6 0 V20" /></>, p),
  'penis-4': (p) => base(<><ellipse cx="32" cy="48" rx="12" ry="8" /><path d="M32 40 V8" /></>, p),
  'penis-5': (p) => base(<><ellipse cx="32" cy="48" rx="8" ry="7" /><path d="M32 41 V18 q4 -6 8 -2" /></>, p),
  'penis-6': (p) => base(<><ellipse cx="32" cy="50" rx="10" ry="6" /><path d="M28 44 V14 q4 -4 8 0 V44" /></>, p),
};

export const vaginaPictograms: Record<string, Picto> = {
  'vagina-1': (p) => base(<path d="M32 10 C20 28 20 36 32 54 C44 36 44 28 32 10 Z" />, p),
  'vagina-2': (p) => base(<><path d="M32 10 C22 28 22 36 32 54 C42 36 42 28 32 10 Z" /><path d="M32 18 V46" /></>, p),
  'vagina-3': (p) => base(<><ellipse cx="32" cy="32" rx="10" ry="22" /><path d="M28 14 Q32 18 36 14" /></>, p),
  'vagina-4': (p) => base(<path d="M22 14 Q32 32 22 50 M42 14 Q32 32 42 50" />, p),
  'vagina-5': (p) => base(<><path d="M32 12 C20 30 20 34 32 52" /><path d="M32 12 C44 30 44 34 32 52" /><circle cx="32" cy="20" r="2" /></>, p),
  'vagina-6': (p) => base(<><path d="M32 12 C18 32 18 36 32 54" /><path d="M32 12 C46 32 46 36 32 54" /></>, p),
};

export const intersexPictograms: Record<string, Picto> = {
  'intersex-1': (p) => base(<><circle cx="32" cy="32" r="18" /><path d="M14 14 L22 22 M18 14 H14 V18" /><path d="M32 50 V58 M28 58 H36" /></>, p),
  'intersex-2': (p) => base(<><circle cx="32" cy="32" r="16" /><path d="M32 16 V8 M28 12 L32 8 L36 12" /><path d="M44 44 L50 50 M50 46 V50 H46" /></>, p),
};

// ---------------- Body pictograms ----------------

export const bodyPictograms: Record<string, Picto> = {
  'body-slim':       (p) => base(<><circle cx="32" cy="12" r="6" /><path d="M32 18 V40 M26 22 H38 M28 40 L24 60 M36 40 L40 60" /></>, p),
  'body-average':    (p) => base(<><circle cx="32" cy="12" r="6" /><path d="M32 18 V42 M24 22 H40 M28 42 L24 60 M36 42 L40 60" /></>, p),
  'body-athletic':   (p) => base(<><circle cx="32" cy="12" r="6" /><path d="M32 18 V42 M22 22 H42 M20 26 Q32 32 44 26 M28 42 L22 60 M36 42 L42 60" /></>, p),
  'body-muscular':   (p) => base(<><circle cx="32" cy="12" r="6" /><path d="M32 18 V44 M20 24 H44 M18 28 Q32 36 46 28 M16 22 L20 24 M48 22 L44 24 M26 44 L20 60 M38 44 L44 60" /></>, p),
  'body-bear':       (p) => base(<><circle cx="32" cy="12" r="6" /><path d="M32 18 V46 M20 24 Q32 32 44 24 M18 32 Q32 42 46 32 M26 46 L22 60 M38 46 L42 60" /></>, p),
  'body-chub':       (p) => base(<><circle cx="32" cy="12" r="6" /><path d="M32 18 V46 M18 28 Q32 40 46 28 M22 46 L20 60 M42 46 L44 60" /></>, p),
  'body-twink':      (p) => base(<><circle cx="32" cy="12" r="5" /><path d="M32 17 V40 M27 22 H37 M29 40 L26 60 M35 40 L38 60" /></>, p),
  'body-otter':      (p) => base(<><circle cx="32" cy="12" r="6" /><path d="M32 18 V42 M24 22 H40 M22 28 Q32 34 42 28 M28 42 L24 60 M36 42 L40 60" /></>, p),
};

// ---------------- Erection-angle silhouettes ----------------
// 0° = pointing down, 90° = horizontal, 180° = pointing up.

const angleSvg = (deg: number): Picto => (p) => {
  // pivot at (32,40); shaft length 22.
  const rad = ((180 - deg) * Math.PI) / 180; // 0 → straight down, 180 → straight up
  const tipX = 32 + Math.sin(rad) * 22;
  const tipY = 40 + Math.cos(rad) * 22;
  return base(
    <>
      <ellipse cx="32" cy="50" rx="10" ry="6" />
      <path d={`M32 40 L${tipX.toFixed(1)} ${tipY.toFixed(1)}`} strokeWidth={4} />
    </>,
    p,
  );
};

export const angleOptions: { key: string; label: string; deg: number; Picto: Picto }[] = [
  { key: 'angle-0',   label: '0°',   deg: 0,   Picto: angleSvg(0) },
  { key: 'angle-30',  label: '30°',  deg: 30,  Picto: angleSvg(30) },
  { key: 'angle-60',  label: '60°',  deg: 60,  Picto: angleSvg(60) },
  { key: 'angle-90',  label: '90°',  deg: 90,  Picto: angleSvg(90) },
  { key: 'angle-120', label: '120°', deg: 120, Picto: angleSvg(120) },
  { key: 'angle-150', label: '150°', deg: 150, Picto: angleSvg(150) },
  { key: 'angle-180', label: '180°', deg: 180, Picto: angleSvg(180) },
];

export function getGenitalPictogramSet(genitalia: string | null | undefined): Record<string, Picto> {
  if (genitalia === 'penis') return penisPictograms;
  if (genitalia === 'vagina') return vaginaPictograms;
  if (genitalia === 'intersex') return intersexPictograms;
  return {};
}
