import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';

/**
 * The chemsex wheel — seven substance categories arranged as a wheel, each
 * with the substances used in chemsex settings and what they do.
 *
 * Adapted from The Drugs Wheel by Mark Adley (thedrugswheel.com, CC BY-NC-SA
 * 4.0) as presented by the Kink Responsibly programme; geometry and prose are
 * ours. Rebuilt in the house SVG idiom (CityNetwork/IntentMap): monochrome ink
 * geometry — the labels carry the categories, seven sectors cannot borrow the
 * four track colours — with HTML labels absolutely positioned over an
 * `aria-hidden` SVG, and substances as links into their glossary pages.
 *
 * THE WHEEL IS NEVER THE ONLY CARRIER. The category list below it renders the
 * same substances and adds the effect summaries; screen readers and narrow
 * screens read the list, the wheel pans inside its own overflow container
 * (never the page body).
 */

interface WheelCategory {
  key: string;
  label: string;
  effects: string;
  substances: { name: string; slug: string }[];
}

const CATEGORIES: WheelCategory[] = [
  {
    key: 'stimulants',
    label: 'Stimulants',
    effects:
      'Energy, focus and libido, less tiredness — at the cost of exhaustion, heart palpitations, aggression and blurred boundaries. Condom use often drops off under stimulants.',
    substances: [
      { name: 'Crystal meth', slug: 'methamphetamine' },
      { name: 'Cocaine', slug: 'cocaine' },
      { name: 'Speed', slug: 'amphetamine' },
    ],
  },
  {
    key: 'empathogens',
    label: 'Empathogens',
    effects:
      'Connection, euphoria and openness — with dehydration, overheating and a heavy comedown. Drink small sips, not litres.',
    substances: [
      { name: 'MDMA / ecstasy', slug: 'mdma' },
      { name: '3-MMC', slug: '3-mmc' },
      { name: 'Mephedrone', slug: 'mephedrone' },
    ],
  },
  {
    key: 'hallucinogens',
    label: 'Hallucinogens',
    effects:
      'Altered senses, perception and spirituality — intensity and vulnerability rise together, so set and setting matter more than dose alone.',
    substances: [
      { name: 'LSD', slug: 'lsd' },
      { name: '2C-B', slug: '2c-b' },
    ],
  },
  {
    key: 'dissociatives',
    label: 'Dissociatives',
    effects:
      'Distance and detachment from the body, pain relief, loss of control — which is also the injury risk: pain is information.',
    substances: [
      { name: 'Ketamine', slug: 'ketamine' },
      { name: 'Poppers', slug: 'poppers' },
    ],
  },
  {
    key: 'depressants',
    label: 'Depressants',
    effects:
      'Relaxation and disinhibition — with a narrow dose window, blackouts, and real danger combined with other downers. GHB overdose is a medical emergency.',
    substances: [
      { name: 'Alcohol', slug: 'alcohol' },
      { name: 'GHB / GBL', slug: 'ghb' },
    ],
  },
  {
    key: 'opioids',
    label: 'Opioids',
    effects:
      'Pain relief and sedation — the highest overdose risk of any class, sharply higher when combined with alcohol or other depressants.',
    substances: [
      { name: 'Morphine', slug: 'morphine' },
      { name: 'Heroin', slug: 'heroin' },
      { name: 'Tramadol', slug: 'tramadol' },
    ],
  },
  {
    key: 'cannabinoids',
    label: 'Cannabinoids',
    effects:
      'Relaxation and altered perception — synthetic cannabinoids are far more potent than plant cannabis and behave very differently.',
    substances: [
      { name: 'Cannabis', slug: 'cannabis' },
      { name: 'Synthetics', slug: 'synthetic-cannabinoids' },
    ],
  },
];

const SECTOR = 360 / CATEGORIES.length;

/** Polar → percentage coordinates on the square container. `r` is a fraction
 *  of the half-width; angles in degrees, 0 = up. */
function pos(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    left: `${50 + Math.cos(rad) * r * 50}%`,
    top: `${50 + Math.sin(rad) * r * 50}%`,
  };
}

export function ChemsexWheel() {
  const { t } = useTranslation();

  // Spokes between sectors, in SVG user units (viewBox 400).
  const spokes = useMemo(
    () =>
      CATEGORIES.map((_, i) => {
        const rad = ((i * SECTOR - 90) * Math.PI) / 180;
        return {
          x1: 200 + Math.cos(rad) * 46,
          y1: 200 + Math.sin(rad) * 46,
          x2: 200 + Math.cos(rad) * 192,
          y2: 200 + Math.sin(rad) * 192,
        };
      }),
    [],
  );

  return (
    <section className="border-y border-border-hairline py-8">
      <Eyebrow as="p">{t('tags.wheel.eyebrow', 'Know what you take')}</Eyebrow>
      <h2 className="mt-2 font-display text-headline leading-tight md:text-display">
        {t('tags.wheel.title', 'The chemsex wheel')}
      </h2>
      <p className="mt-4 max-w-reading text-13 leading-relaxed text-muted-foreground">
        {t(
          'tags.wheel.intro',
          'Seven categories of substances that show up in chemsex settings. The wheel groups them by what they do; each name opens its glossary page with combination warnings. Any use involves risk — the only way to exclude it is not using.',
        )}
      </p>

      {/* ── The wheel ───────────────────────────────────────────────────── */}
      <div className="mt-8 overflow-x-auto">
        <div className="relative mx-auto aspect-square w-full min-w-[560px] max-w-[720px]">
          <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <circle
              cx="200"
              cy="200"
              r="192"
              className="fill-none stroke-foreground"
              strokeWidth="3"
            />
            <circle
              cx="200"
              cy="200"
              r="128"
              className="fill-none stroke-foreground"
              strokeWidth="1.5"
            />
            <circle
              cx="200"
              cy="200"
              r="46"
              className="fill-none stroke-foreground"
              strokeWidth="3"
            />
            {spokes.map((s, i) => (
              <line
                key={i}
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                className="stroke-foreground"
                strokeWidth="1.5"
              />
            ))}
          </svg>

          {/* Centre */}
          <span
            className="absolute -translate-x-1/2 -translate-y-1/2 text-2xs font-bold uppercase tracking-label"
            style={pos(0, 0)}
          >
            {t('tags.wheel.centre', 'Chemsex')}
          </span>

          {CATEGORIES.map((cat, i) => {
            const mid = (i + 0.5) * SECTOR;
            return (
              <div key={cat.key} aria-hidden="true">
                {/* Category name in the outer band */}
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-card px-2 py-0.5 text-2xs font-bold uppercase tracking-label rounded-container shadow-soft"
                  style={pos(mid, 0.8)}
                >
                  {cat.label}
                </span>
                {/* Substances in the inner ring */}
                <div
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                  style={pos(mid, 0.44)}
                >
                  {cat.substances.map((s) => (
                    <LocalizedLink
                      key={s.slug}
                      to={`/tags/${s.slug}`}
                      tabIndex={-1}
                      className="whitespace-nowrap border border-foreground/40 bg-background px-1.5 py-0.5 text-3xs font-bold text-foreground no-underline hover:border-border-hairline hover:bg-foreground hover:text-background"
                    >
                      {s.name}
                    </LocalizedLink>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── The same content, readable ──────────────────────────────────── */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CATEGORIES.map((cat) => (
          <div key={cat.key} className="bg-muted rounded-element p-4">
            <h3 className="text-2xs font-bold uppercase tracking-label">{cat.label}</h3>
            <p className="mt-2 text-13 leading-relaxed text-muted-foreground">{cat.effects}</p>
            <ul className="mt-2 flex list-none flex-wrap gap-2 p-0">
              {cat.substances.map((s) => (
                <li key={s.slug}>
                  <LocalizedLink
                    to={`/tags/${s.slug}`}
                    className="border border-foreground/40 px-1.5 py-0.5 text-13 font-bold text-foreground no-underline hover:border-border-hairline hover:bg-foreground hover:text-background"
                  >
                    {s.name}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-6 text-2xs uppercase tracking-label text-muted-foreground">
        {t('tags.wheel.credit', 'Adapted from')}{' '}
        <a href="https://www.thedrugswheel.com/" target="_blank" rel="noopener noreferrer">
          The Drugs Wheel
        </a>{' '}
        {t(
          'tags.wheel.creditTail',
          'by Mark Adley (CC BY-NC-SA 4.0), via Kink Responsibly, Darklands.',
        )}
      </p>
    </section>
  );
}
