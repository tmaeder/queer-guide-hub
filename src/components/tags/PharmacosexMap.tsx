import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';

/**
 * The pharmacosex model — why people combine substances and sex: six core
 * effects arranged as a hexagon, the substances that sit between them, and
 * the motivations around the outside.
 *
 * Rebuilt from the research model shown by the Kink Responsibly programme
 * (Darklands) in the house idiom: `aria-hidden` SVG geometry (hexagon + the
 * two inner triangles), HTML labels absolutely positioned over it, monochrome
 * ink — the two visual tiers of the original (dark vs. highlight circles) are
 * ink-filled vs. paper-filled here, never a colour code.
 *
 * THE MAP IS NEVER THE ONLY CARRIER: the lists below repeat every effect,
 * substance and motivation in reading order.
 */

interface Effect {
  key: string;
  label: string;
  meaning: string;
  /** degrees, 0 = up, clockwise */
  angle: number;
  /** ink-filled (the original's dark tier) vs paper-filled */
  filled: boolean;
}

const EFFECTS: Effect[] = [
  { key: 'stimulation', label: 'Stimulation', meaning: 'Energy and drive — keeping going, staying awake.', angle: 0, filled: true },
  { key: 'empathy', label: 'Empathy', meaning: 'Openness and connection with the people you are with.', angle: 60, filled: false },
  { key: 'sensory', label: 'Sensory perception', meaning: 'Heightened senses — touch, sound and sensation feel bigger.', angle: 120, filled: true },
  { key: 'chill', label: 'Chill', meaning: 'Relaxation — letting tension and negative feelings drop away.', angle: 180, filled: false },
  { key: 'disinhibition', label: 'Disinhibition', meaning: 'Fewer brakes — more confidence, fewer reservations.', angle: 240, filled: true },
  { key: 'euphoria', label: 'Euphoria', meaning: 'Intense well-being and pleasure.', angle: 300, filled: false },
];

interface MapSubstance {
  name: string;
  slug: string;
  /** which effects it sits between, for the readable list */
  between: string;
  left: number;
  top: number;
}

const SUBSTANCES: MapSubstance[] = [
  { name: 'Cocaine', slug: 'cocaine', between: 'stimulation', left: 50, top: 25 },
  { name: '(Meth)amphetamine', slug: 'methamphetamine', between: 'euphoria & stimulation', left: 36, top: 33 },
  { name: '3,4-MMC', slug: '3-mmc', between: 'stimulation & empathy', left: 63, top: 33 },
  { name: 'MDMA / XTC', slug: 'mdma', between: 'empathy', left: 67, top: 42 },
  { name: 'GHB / GBL', slug: 'ghb', between: 'euphoria & disinhibition', left: 32, top: 44 },
  { name: '2C-B', slug: '2c-b', between: 'empathy & sensory perception', left: 66, top: 52 },
  { name: 'Alcohol', slug: 'alcohol', between: 'disinhibition', left: 32, top: 56 },
  { name: 'Poppers', slug: 'poppers', between: 'sensory perception', left: 64, top: 61 },
  { name: 'Ketamine', slug: 'ketamine', between: 'disinhibition & chill', left: 37, top: 65 },
  { name: 'Cannabis', slug: 'cannabis', between: 'chill & sensory perception', left: 52, top: 67 },
];

interface Motivation {
  label: string;
  near: string;
  left: number;
  top: number;
}

const MOTIVATIONS: Motivation[] = [
  { label: 'Keep on going', near: 'stimulation', left: 33, top: 10 },
  { label: 'Connectedness', near: 'empathy', left: 68, top: 11 },
  { label: 'Rougher / more extreme', near: 'stimulation & euphoria', left: 15, top: 22 },
  { label: 'Healing intent', near: 'empathy', left: 85, top: 25 },
  { label: 'Higher confidence', near: 'disinhibition', left: 10, top: 45 },
  { label: 'In the moment', near: 'sensory perception', left: 89, top: 47 },
  { label: 'Suppress negative feelings', near: 'chill', left: 22, top: 80 },
  { label: 'Painless', near: 'chill', left: 50, top: 89 },
  { label: 'More pleasure', near: 'sensory perception', left: 76, top: 80 },
];

/** Hexagon vertex in SVG user units (viewBox 400), r from centre 200. */
function vertex(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 200 + Math.cos(rad) * r, y: 200 + Math.sin(rad) * r };
}

export function PharmacosexMap() {
  const { t } = useTranslation();
  const R = 138;
  const verts = EFFECTS.map((e) => vertex(e.angle, R));
  const hexPoints = verts.map((v) => `${v.x},${v.y}`).join(' ');
  const triA = [verts[0], verts[2], verts[4]].map((v) => `${v.x},${v.y}`).join(' ');
  const triB = [verts[1], verts[3], verts[5]].map((v) => `${v.x},${v.y}`).join(' ');

  return (
    <section className="border-y-4 border-foreground py-8">
      <Eyebrow as="p">{t('tags.pharmacosex.eyebrow', 'Why people mix')}</Eyebrow>
      <h2 className="mt-2 font-display text-headline leading-tight md:text-display">
        {t('tags.pharmacosex.title', 'The pharmacosex model')}
      </h2>
      <p className="mt-4 max-w-reading text-13 leading-relaxed text-muted-foreground">
        {t(
          'tags.pharmacosex.intro',
          'Combining substances and sex usually chases one of six core effects. The model maps which substances sit closest to which effect, and the motivations people name around the outside. Naming the motivation honestly is the first harm-reduction step: it tells you what need the substance is standing in for.',
        )}
      </p>

      {/* ── The map ─────────────────────────────────────────────────────── */}
      <div className="mt-8 overflow-x-auto">
        <div className="relative mx-auto aspect-square w-full min-w-[560px] max-w-[720px]">
          <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <polygon points={hexPoints} className="fill-none stroke-foreground" strokeWidth="1.5" />
            <polygon points={triA} className="fill-none stroke-foreground/30" strokeWidth="1" />
            <polygon points={triB} className="fill-none stroke-foreground/30" strokeWidth="1" />
          </svg>

          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xs font-bold uppercase tracking-label"
            aria-hidden="true"
          >
            {t('tags.pharmacosex.centre', 'Pharmacosex')}
          </span>

          {EFFECTS.map((e) => {
            const rad = ((e.angle - 90) * Math.PI) / 180;
            const left = 50 + Math.cos(rad) * 34.5;
            const top = 50 + Math.sin(rad) * 34.5;
            return (
              <span
                key={e.key}
                aria-hidden="true"
                className={`absolute flex aspect-square w-[19%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-foreground p-2 text-center text-2xs font-bold uppercase leading-tight tracking-label ${
                  e.filled ? 'bg-foreground text-background' : 'bg-background text-foreground'
                }`}
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                {e.label}
              </span>
            );
          })}

          {SUBSTANCES.map((s) => (
            <LocalizedLink
              key={s.slug}
              to={`/tags/${s.slug}`}
              tabIndex={-1}
              aria-hidden="true"
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap border border-foreground bg-background px-1.5 py-0.5 text-3xs font-bold text-foreground no-underline hover:bg-foreground hover:text-background"
              style={{ left: `${s.left}%`, top: `${s.top}%` }}
            >
              {s.name}
            </LocalizedLink>
          ))}

          {MOTIVATIONS.map((m) => (
            <span
              key={m.label}
              aria-hidden="true"
              className="absolute max-w-[18%] -translate-x-1/2 -translate-y-1/2 border-2 border-dashed border-foreground/50 px-1.5 py-1 text-center text-3xs font-bold uppercase leading-tight tracking-label text-muted-foreground"
              style={{ left: `${m.left}%`, top: `${m.top}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── The same content, readable ──────────────────────────────────── */}
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <div>
          <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('tags.pharmacosex.effects', 'Core effects')}
          </h3>
          <ul className="mt-2 list-none p-0">
            {EFFECTS.map((e) => (
              <li key={e.key} className="border-b-2 border-foreground/15 py-2 last:border-b-0">
                <span className="text-13 font-bold">{e.label}</span>
                <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{e.meaning}</p>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('tags.pharmacosex.motivations', 'Motivations people name')}
          </h3>
          <ul className="mt-2 flex list-none flex-wrap gap-2 p-0">
            {MOTIVATIONS.map((m) => (
              <li
                key={m.label}
                className="border-2 border-dashed border-foreground/50 px-2 py-1 text-13 text-muted-foreground"
              >
                {m.label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('tags.pharmacosex.substances', 'Where the substances sit')}
          </h3>
          <ul className="mt-2 list-none p-0">
            {SUBSTANCES.map((s) => (
              <li
                key={s.slug}
                className="flex items-baseline justify-between gap-4 border-b-2 border-foreground/15 py-2 last:border-b-0"
              >
                <LocalizedLink
                  to={`/tags/${s.slug}`}
                  className="text-13 font-bold text-foreground no-underline hover:underline"
                >
                  {s.name}
                </LocalizedLink>
                <span className="text-13 text-muted-foreground">{s.between}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-6 text-2xs uppercase tracking-label text-muted-foreground">
        {t(
          'tags.pharmacosex.credit',
          'Model as presented by Kink Responsibly, Darklands. Substance positions are indicative, not dosage advice.',
        )}
      </p>
    </section>
  );
}
