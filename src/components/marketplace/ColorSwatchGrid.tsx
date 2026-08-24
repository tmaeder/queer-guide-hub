import { FilterChip } from '@/components/transit/FilterChip';

/**
 * bg-swatch-* utilities from the mode-independent literals in src/index.css
 * (`--color-swatch-*` — product colour, never theme colour). WCAG 1.4.1: the
 * swatch dot is pure decoration inside a text-labelled chip — the label and
 * the chip's ink fill carry the state, never the dot. rainbow/multicolor have
 * no entry and render label-only.
 */
const SWATCH_CLASS_BY_SLUG: Record<string, string> = {
  black: 'bg-swatch-black',
  white: 'bg-swatch-white',
  grey: 'bg-swatch-grey',
  red: 'bg-swatch-red',
  orange: 'bg-swatch-orange',
  yellow: 'bg-swatch-yellow',
  green: 'bg-swatch-green',
  blue: 'bg-swatch-blue',
  navy: 'bg-swatch-navy',
  purple: 'bg-swatch-purple',
  pink: 'bg-swatch-pink',
  brown: 'bg-swatch-brown',
  beige: 'bg-swatch-beige',
  cream: 'bg-swatch-cream',
  gold: 'bg-swatch-gold',
  silver: 'bg-swatch-silver',
  'rose-gold': 'bg-swatch-rose-gold',
  clear: 'bg-swatch-clear',
};

function colorLabel(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ColorSwatchGridProps {
  /** Available color slugs with counts (bare values: black, rainbow, …). */
  options: Array<{ slug: string; count: number }>;
  /** Selected bare color slugs. */
  selected: string[];
  onToggle: (slug: string) => void;
}

export function ColorSwatchGrid({ options, selected, onToggle }: ColorSwatchGridProps) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const swatch = SWATCH_CLASS_BY_SLUG[opt.slug];
        return (
          <FilterChip
            key={opt.slug}
            active={selected.includes(opt.slug)}
            onClick={() => onToggle(opt.slug)}
            aria-label={`Color ${colorLabel(opt.slug)} (${opt.count.toLocaleString()} items)`}
            label={
              <>
                {swatch && (
                  <span
                    aria-hidden="true"
                    className={`h-3 w-3 shrink-0 rounded-full ring-1 ring-border-hairline ${swatch}`}
                  />
                )}
                {colorLabel(opt.slug)}
              </>
            }
          />
        );
      })}
    </div>
  );
}
