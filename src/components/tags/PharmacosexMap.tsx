import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { cn } from '@/lib/utils';
import { TRACK_STROKE } from '@/components/transit/routeBulletMap';

/**
 * The pharmacosex model — why people combine substances and sex.
 *
 * Six core effects sit on a ring as stations. Every substance in the model
 * either sits right at one effect or between two NEIGHBOURING effects, so it
 * is drawn as a stop on the arc between them. That is the whole model, and
 * the ring states it with no crossing lines.
 *
 * An earlier version drew a hexagon plus two inner triangles with labels
 * absolutely positioned over it: connectors ran into nothing, labels sat on
 * top of the lines, three effects were circles and three were bare text, and
 * the motivations floated with no tie to anything. The guide under the map
 * now carries the motivations, filed under the effect they are named for.
 *
 * The map is one unstretched, `aria-hidden` SVG; HTML labels sit over it.
 * The guide is the readable form and the controls: picking an effect lights
 * its station, its arcs and the substances on them. Rebuilt from the research
 * model shown by the Kink Responsibly programme (Darklands).
 */

interface Effect {
  key: string;
  label: string;
  meaning: string;
  /** What people say they are after, filed under this effect. */
  motivations: string[];
}

/** Ring order, clockwise from the top. Neighbours matter: see SUBSTANCES. */
const EFFECTS: Effect[] = [
  {
    key: 'stimulation',
    label: 'Stimulation',
    meaning: 'Energy and drive — keeping going, staying awake.',
    motivations: ['Keep on going'],
  },
  {
    key: 'empathy',
    label: 'Empathy',
    meaning: 'Openness and connection with the people you are with.',
    motivations: ['Connectedness', 'Healing intent'],
  },
  {
    key: 'sensory',
    label: 'Sensory perception',
    meaning: 'Heightened senses — touch, sound and sensation feel bigger.',
    motivations: ['In the moment', 'More pleasure'],
  },
  {
    key: 'chill',
    label: 'Chill',
    meaning: 'Relaxation — letting tension and negative feelings drop away.',
    motivations: ['Suppress negative feelings', 'Painless'],
  },
  {
    key: 'disinhibition',
    label: 'Disinhibition',
    meaning: 'Fewer brakes — more confidence, fewer reservations.',
    motivations: ['Higher confidence'],
  },
  {
    key: 'euphoria',
    label: 'Euphoria',
    meaning: 'Intense well-being and pleasure.',
    motivations: ['Rougher / more extreme'],
  },
];

interface Substance {
  name: string;
  slug: string;
  /** One effect (sits right at it) or two NEIGHBOURING effects (between). */
  at: [string] | [string, string];
}

const SUBSTANCES: Substance[] = [
  { name: 'Cocaine', slug: 'cocaine', at: ['stimulation'] },
  { name: '(Meth)amphetamine', slug: 'methamphetamine', at: ['euphoria', 'stimulation'] },
  { name: '3,4-MMC', slug: '3-mmc', at: ['stimulation', 'empathy'] },
  { name: 'MDMA / XTC', slug: 'mdma', at: ['empathy'] },
  { name: '2C-B', slug: '2c-b', at: ['empathy', 'sensory'] },
  { name: 'Poppers', slug: 'poppers', at: ['sensory'] },
  { name: 'Cannabis', slug: 'cannabis', at: ['sensory', 'chill'] },
  { name: 'Ketamine', slug: 'ketamine', at: ['chill', 'disinhibition'] },
  { name: 'Alcohol', slug: 'alcohol', at: ['disinhibition'] },
  { name: 'GHB / GBL', slug: 'ghb', at: ['disinhibition', 'euphoria'] },
];

const N = EFFECTS.length;
const idx = (key: string) => EFFECTS.findIndex((e) => e.key === key);

/** viewBox geometry. Square and never stretched. */
const SIZE = 400;
const C = SIZE / 2;
const R = 130;
/** Light wobble; lobes a multiple of 2N so every station AND every arc
 *  midpoint lands on a zero of it, i.e. exactly on the ring. */
const WOBBLE = 3;
const LOBES = 2 * N;
const DEG = Math.PI / 180;
const angleOfIndex = (i: number) => (-90 + (360 / N) * i) * DEG;
const ringR = (a: number) => R + WOBBLE * Math.sin(LOBES * (a + Math.PI / 2));
const at = (a: number, r: number) => ({ x: C + r * Math.cos(a), y: C + r * Math.sin(a) });
const f = (n: number) => Math.round(n * 100) / 100;
const pct = (v: number) => `${(v / SIZE) * 100}%`;

/** Angle of a substance: an effect's own angle, or the midpoint of the arc
 *  between two neighbours (going the short way round). */
function angleOfSubstance(s: Substance): number {
  if (s.at.length === 1) return angleOfIndex(idx(s.at[0]));
  const [a, b] = s.at.map(idx);
  const lo = (b - a + N) % N === 1 ? a : b;
  return angleOfIndex(lo) + Math.PI / N;
}

/** Arc from station i to station i+1, as a polyline on the wobbly ring. */
function arcPath(i: number): string {
  const a0 = angleOfIndex(i);
  const steps = 30;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const a = a0 + ((2 * Math.PI) / N) * (k / steps);
    const p = at(a, ringR(a));
    return `${k === 0 ? 'M' : 'L'} ${f(p.x)} ${f(p.y)}`;
  }).join(' ');
}

const ARCS = EFFECTS.map((_, i) => arcPath(i));

const side0 = (a: number) => (Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'centre');

export function PharmacosexMap() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  const sel = selected ? idx(selected) : -1;
  const arcLit = (i: number) => sel < 0 || i === sel || (i + 1) % N === sel;
  const substanceLit = (s: Substance) => !selected || s.at.includes(selected);

  return (
    <section className="border-y border-border-hairline py-8">
      <Eyebrow as="p">{t('tags.pharmacosex.eyebrow', 'Why people mix')}</Eyebrow>
      <h2 className="mt-2 font-display text-headline leading-tight md:text-display">
        {t('tags.pharmacosex.title', 'The pharmacosex model')}
      </h2>
      <p className="mt-4 max-w-reading text-13 leading-relaxed text-muted-foreground">
        {t(
          'tags.pharmacosex.intro',
          'Combining substances and sex usually chases one of six core effects. The model maps which substances sit closest to which effect, and the motivations people name for each. Naming the motivation honestly is the first harm-reduction step: it tells you what need the substance is standing in for.',
        )}
      </p>

      {/* ── The map ─────────────────────────────────────────────────────── */}
      <div className="relative mx-auto mt-8 aspect-square w-full max-w-[34rem]">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden="true"
          focusable="false"
          className="absolute inset-0 block h-full w-full overflow-visible"
        >
          {ARCS.map((d, i) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={TRACK_STROKE.blue}
              strokeWidth={6}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={cn('transition-opacity', !arcLit(i) && 'opacity-25')}
            />
          ))}
          {/* Substances sitting right at an effect hang off its station on a
              short spur toward the centre. */}
          {SUBSTANCES.filter((s) => s.at.length === 1).map((s) => {
            const a = angleOfSubstance(s);
            const from = at(a, R);
            const to = at(a, R - 44);
            return (
              <path
                key={s.slug}
                d={`M ${f(from.x)} ${f(from.y)} L ${f(to.x)} ${f(to.y)}`}
                stroke={TRACK_STROKE.blue}
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className={cn('transition-opacity', !substanceLit(s) && 'opacity-25')}
              />
            );
          })}
          {SUBSTANCES.map((s) => {
            const a = angleOfSubstance(s);
            const p = s.at.length === 1 ? at(a, R - 44) : at(a, R);
            return (
              <circle
                key={s.slug}
                cx={f(p.x)}
                cy={f(p.y)}
                r={6}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                className={cn(
                  'fill-background stroke-foreground transition-opacity',
                  !substanceLit(s) && 'opacity-25',
                )}
              />
            );
          })}
        </svg>

        {/* Substance stops: a small ring on the track, its name inside the
            circle (on phones the guide below carries the names). */}
        {SUBSTANCES.map((s) => {
          const a = angleOfSubstance(s);
          const single = s.at.length === 1;
          const label = at(a, single ? R - 70 : R - 30);
          const lit = substanceLit(s);
          return (
            <span key={s.slug} aria-hidden="true">
              <span
                style={{ left: pct(label.x), top: pct(label.y) }}
                className={cn(
                  'absolute hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-2xs font-bold transition-opacity sm:block',
                  !lit && 'opacity-25',
                )}
              >
                {s.name}
              </span>
            </span>
          );
        })}

        {/* Effect stations, labelled outside the ring. */}
        {EFFECTS.map((e, i) => {
          const a = angleOfIndex(i);
          const p = at(a, R);
          const lp = at(a, side0(a) === 'centre' ? R + 34 : R + 26);
          // Stations on the sides take their label beside them, aligned away
          // from the ring; top and bottom take it centred above/below.
          const side = side0(a);
          const lit = sel < 0 || sel === i;
          return (
            <span key={e.key} aria-hidden="true">
              <span
                style={{ left: pct(p.x), top: pct(p.y) }}
                className={cn(
                  'absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-foreground text-13 font-bold transition-opacity',
                  sel === i ? 'bg-track-blue text-track-ring' : 'bg-background',
                  !lit && 'opacity-40',
                )}
              >
                {i + 1}
              </span>
              <span
                style={{ left: pct(lp.x), top: pct(lp.y) }}
                className={cn(
                  // Phones show the station numbers only; the numbered guide below
                  // names them, so no label is cut off at the screen edge.
                  'absolute hidden w-32 -translate-y-1/2 text-13 font-bold leading-tight transition-opacity sm:block',
                  side === 'centre' && '-translate-x-1/2 text-center',
                  side === 'right' && 'text-start',
                  side === 'left' && '-translate-x-full text-end',
                  !lit && 'opacity-40',
                )}
              >
                {e.label}
              </span>
            </span>
          );
        })}

        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xs font-bold uppercase tracking-label text-muted-foreground"
        >
          {t('tags.pharmacosex.centre', 'Pharmacosex')}
        </span>
      </div>

      {/* ── The guide: the map in words, and its controls ───────────────── */}
      <p className="mt-8 text-13 text-muted-foreground">
        {t('tags.pharmacosex.hint', 'Pick an effect to light up its stations on the ring.')}
      </p>
      <ol className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {EFFECTS.map((e, i) => {
          const here = SUBSTANCES.filter((s) => s.at.length === 1 && s.at[0] === e.key);
          const next = EFFECTS[(i + 1) % N];
          const between = SUBSTANCES.filter(
            (s) => s.at.length === 2 && s.at.includes(e.key) && s.at.includes(next.key),
          );
          const isSel = selected === e.key;
          return (
            <li
              key={e.key}
              className={cn(
                'rounded-container bg-surface-container p-4 transition-opacity',
                selected && !isSel && 'opacity-50',
              )}
            >
              <button
                type="button"
                aria-pressed={isSel}
                onClick={() => setSelected(isSel ? null : e.key)}
                className="flex w-full items-center gap-2 rounded-element text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[3px] border-foreground text-13 font-bold',
                    isSel ? 'bg-track-blue text-track-ring' : 'bg-background',
                  )}
                >
                  {i + 1}
                </span>
                <span className="text-15 font-bold">{e.label}</span>
              </button>
              <p className="mt-2 text-13 leading-relaxed text-muted-foreground">{e.meaning}</p>
              {here.length > 0 && (
                <p className="mt-2 text-13">
                  <span className="text-muted-foreground">
                    {t('tags.pharmacosex.atEffect', 'Right here:')}{' '}
                  </span>
                  {here.map((s, k) => (
                    <span key={s.slug}>
                      {k > 0 && ', '}
                      <LocalizedLink to={`/tags/${s.slug}`} className="font-bold">
                        {s.name}
                      </LocalizedLink>
                    </span>
                  ))}
                </p>
              )}
              {between.length > 0 && (
                <p className="mt-1 text-13">
                  <span className="text-muted-foreground">
                    {t('tags.pharmacosex.towards', 'On the way to {{next}}:', {
                      next: next.label,
                    })}{' '}
                  </span>
                  {between.map((s, k) => (
                    <span key={s.slug}>
                      {k > 0 && ', '}
                      <LocalizedLink to={`/tags/${s.slug}`} className="font-bold">
                        {s.name}
                      </LocalizedLink>
                    </span>
                  ))}
                </p>
              )}
              <p className="mt-2 text-13">
                <span className="text-muted-foreground">
                  {t('tags.pharmacosex.motivationsShort', 'People say:')}{' '}
                </span>
                {e.motivations.map((m) => `“${m}”`).join(' · ')}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-2xs uppercase tracking-label text-muted-foreground">
        {t(
          'tags.pharmacosex.credit',
          'Model as presented by Kink Responsibly, Darklands. Substance positions are indicative, not dosage advice.',
        )}
      </p>
    </section>
  );
}
