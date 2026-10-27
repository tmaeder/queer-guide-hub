// Line-art pictograms for the intimate-profile add-on.
// Monochrome, currentColor stroke, 64×64 grid. v2 — redrawn 2026-06-11 for
// recognizability + clearer differentiation between variants. Keys are stored
// in intimate_profiles (genital_pictogram_key / body_pictogram_key) — never
// rename a key, only redraw its art.

import type { SVGProps } from 'react';

type Picto = (p: SVGProps<SVGSVGElement>) => JSX.Element;

const base = (children: JSX.Element, props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

// ---------------- Genital pictograms ----------------
// Front view, shaft up. Variants differ in one readable trait each:
// 1 straight · 2 curved right · 3 thick · 4 long+slim · 5 uncut · 6 curved left.

const scrotum = (
  <>
    <circle cx="25.5" cy="49" r="7" />
    <circle cx="38.5" cy="49" r="7" />
  </>
);

export const penisPictograms: Record<string, Picto> = {
  // straight, average
  'penis-1': (p) => base(<>{scrotum}<path d="M28 42 V19 Q28 11 32 11 Q36 11 36 19 V42" /><path d="M28 20 Q32 24 36 20" /></>, p),
  // curved (rises to the right)
  'penis-2': (p) => base(<>{scrotum}<path d="M28 42 C27 30 30 19 40 13 Q44 11 45.5 14.5 Q47 18 43 20.5 C37 24 36 33 36 42" /><path d="M40 15.5 Q43 19 39 21.5" /></>, p),
  // thick
  'penis-3': (p) => base(<>{scrotum}<path d="M26 42 V21 Q26 11 32 11 Q38 11 38 21 V42" /><path d="M26 22 Q32 27 38 22" /></>, p),
  // long + slim
  'penis-4': (p) => base(<>{scrotum}<path d="M29 42 V14 Q29 7.5 32 7.5 Q35 7.5 35 14 V42" /><path d="M29 15.5 Q32 18.5 35 15.5" /></>, p),
  // uncut — tapered foreskin tip
  'penis-5': (p) => base(<>{scrotum}<path d="M28 42 V19 C28 13 30 9.5 32 7 C34 9.5 36 13 36 19 V42" /><path d="M30.5 11 Q32 13 33.5 11" /></>, p),
  // curved (rises to the left)
  'penis-6': (p) => base(<>{scrotum}<path d="M36 42 C37 30 34 19 24 13 Q20 11 18.5 14.5 Q17 18 21 20.5 C27 24 28 33 28 42" /><path d="M24 15.5 Q21 19 25 21.5" /></>, p),
};

// Front view. Variants differ in one readable trait each:
// 1 classic · 2 inner labia visible · 3 fuller outer · 4 prominent inner
// labia · 5 neat single line · 6 asymmetric.

const hood = <path d="M29.5 19.5 Q32 16.5 34.5 19.5" />;

export const vaginaPictograms: Record<string, Picto> = {
  // classic — almond outline, hood, center line
  'vagina-1': (p) => base(<><path d="M32 9 C21 21 19 38 32 55 C45 38 43 21 32 9 Z" />{hood}<path d="M32 23 V46" /></>, p),
  // inner labia visible — soft double inner curves
  'vagina-2': (p) => base(<><path d="M32 9 C21 21 19 38 32 55 C45 38 43 21 32 9 Z" />{hood}<path d="M29.5 24 Q28 34 31 45" /><path d="M34.5 24 Q36 34 33 45" /></>, p),
  // fuller outer lips — rounder outline, short line
  'vagina-3': (p) => base(<><path d="M32 10 C19 20 17 40 32 54 C47 40 45 20 32 10 Z" /><path d="M28.5 21 Q32 18 35.5 21" /><path d="M32 26 V42" /></>, p),
  // prominent inner labia — inner curves reaching past the line
  'vagina-4': (p) => base(<><path d="M32 9 C21 21 19 38 32 55 C45 38 43 21 32 9 Z" />{hood}<path d="M30 23 Q26.5 35 30.5 47" /><path d="M34 23 Q37.5 35 33.5 47" /><path d="M32 25 V44" /></>, p),
  // neat — slender outline, single line, small hood dot
  'vagina-5': (p) => base(<><path d="M32 10 C24 22 22.5 38 32 54 C41.5 38 40 22 32 10 Z" /><circle cx="32" cy="20" r="1.75" /><path d="M32 25 V45" /></>, p),
  // asymmetric — one inner lip fuller than the other
  'vagina-6': (p) => base(<><path d="M32 9 C21 21 19 38 32 55 C45 38 43 21 32 9 Z" />{hood}<path d="M31 23 Q29.5 34 31.5 45" /><path d="M33.5 23 Q38 34 33 47" /></>, p),
};

// Combined-symbol marks (circle + mars arrow + venus cross), drawn precisely.
export const intersexPictograms: Record<string, Picto> = {
  // intersex symbol — circle, arrow up-right, cross below
  'intersex-1': (p) => base(<><circle cx="30" cy="32" r="13" /><path d="M39.5 22.5 L51 11" /><path d="M43.5 11 H51 V18.5" /><path d="M30 45 V58" /><path d="M24 52 H36" /></>, p),
  // androgyne variant — circle, arrow straight up, cross below
  'intersex-2': (p) => base(<><circle cx="32" cy="33" r="13" /><path d="M32 20 V6" /><path d="M26.5 11 L32 5.5 L37.5 11" /><path d="M32 46 V58" /><path d="M26 52.5 H38" /></>, p),
};

// ---------------- Body pictograms ----------------
// Torso silhouettes (head + closed torso outline + legs), differentiated by
// shoulder width, waist, belly, and hair marks. Stick figures retired in v2.

const head = (r = 5.5) => <circle cx="32" cy="10" r={r} />;
const legs = (lx: number, rx: number, spread = 2.5) => (
  <path d={`M${lx} 47 L${lx - spread} 60 M${rx} 47 L${rx + spread} 60`} />
);
// Chest-hair squiggles for bear/otter.
const chestHair = (
  <path d="M28 27 q1.5 1.5 3 0 q1.5 1.5 3 0 M27 31 q1.5 1.5 3 0 q1.5 1.5 3 0 q1.5 1.5 3 0" strokeWidth={1.25} />
);

export const bodyPictograms: Record<string, Picto> = {
  // slim — narrow, straight sides
  'body-slim': (p) => base(<>{head()}<path d="M26 20 Q32 17.5 38 20 C38.5 28 38 34 38 40 Q38 44 37.5 47 L26.5 47 Q26 44 26 40 C26 34 25.5 28 26 20 Z" />{legs(28.5, 35.5)}</>, p),
  // average — medium frame, gentle waist
  'body-average': (p) => base(<>{head()}<path d="M24 20 Q32 17 40 20 C41 27 40 32 39 36 Q38.5 42 39 47 L25 47 Q25.5 42 25 36 C24 32 23 27 24 20 Z" />{legs(28, 36)}</>, p),
  // athletic — broad shoulders, V-taper
  'body-athletic': (p) => base(<>{head()}<path d="M21 20 Q32 16.5 43 20 C43 27 40.5 32 38.5 36 Q38 42 38.5 47 L25.5 47 Q26 42 25.5 36 C23.5 32 21 27 21 20 Z" /><path d="M26 25 Q32 28 38 25" strokeWidth={1.25} />{legs(28, 36)}</>, p),
  // muscular — widest shoulders, arm caps, hard taper
  'body-muscular': (p) => base(<>{head(6)}<path d="M19 21 Q32 16 45 21 C45.5 28 42 33 39 37 Q38.5 42 39 47 L25 47 Q25.5 42 25 37 C22 33 18.5 28 19 21 Z" /><path d="M19 21 Q15.5 25 16.5 30 M45 21 Q48.5 25 47.5 30" /><path d="M25.5 26 Q32 30 38.5 26" strokeWidth={1.25} />{legs(27.5, 36.5, 3)}</>, p),
  // bear — broad frame, full belly, chest hair
  'body-bear': (p) => base(<>{head(6)}<path d="M22 20 Q32 17 42 20 C45 28 46 36 44 42 Q43 45.5 41 47 L23 47 Q21 45.5 20 42 C18 36 19 28 22 20 Z" />{chestHair}{legs(27, 37, 3)}</>, p),
  // chub — soft and round all the way down
  'body-chub': (p) => base(<>{head()}<path d="M24 20 Q32 17.5 40 20 C45 28 46.5 38 44 44 Q43 46.5 41 47 L23 47 Q21 46.5 20 44 C17.5 38 19 28 24 20 Z" />{legs(27, 37, 3)}</>, p),
  // twink — very slim, narrowest frame
  'body-twink': (p) => base(<>{head(5)}<path d="M27 19.5 Q32 17.5 37 19.5 C37.5 27 37 34 37 40 Q37 44 36.5 47 L27.5 47 Q27 44 27 40 C27 34 26.5 27 27 19.5 Z" />{legs(29, 35, 2)}</>, p),
  // otter — slim-athletic with chest hair
  'body-otter': (p) => base(<>{head()}<path d="M23.5 20 Q32 17 40.5 20 C41 27 39.5 32 38 36 Q37.5 42 38 47 L26 47 Q26.5 42 26 36 C24.5 32 23 27 23.5 20 Z" />{chestHair}{legs(28.5, 35.5)}</>, p),
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
      <circle cx="26.5" cy="48" r="6" />
      <circle cx="37.5" cy="48" r="6" />
      <path d={`M32 40 L${tipX.toFixed(1)} ${tipY.toFixed(1)}`} strokeWidth={4.5} />
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
