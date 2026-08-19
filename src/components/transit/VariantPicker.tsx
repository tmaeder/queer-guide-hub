import { cn } from '@/lib/utils';

export interface Variant {
  id: string;
  label: string;
  available: boolean;
}

/**
 * Module 09 — "Size, colour, or tier, with the sliding scale set by the rider
 * at checkout." Required on Marketplace, which the spec says it defines.
 *
 * Two rules carried from the spec's Marketplace trap — "A shop template with
 * reviews and stars. Ratings rank people":
 *
 *  1. There is no rating, review count or "popular" flag anywhere in this
 *     signature. Marketplace sellers are community makers; ranking them is
 *     ranking people.
 *  2. Sold-out variants RENDER, disabled, rather than disappearing. A maker
 *     with two sizes left should not look like a maker who only ever made two
 *     — the absence would misrepresent them.
 */
export function VariantPicker({
  groupLabel,
  variants,
  selectedId,
  onSelect,
  className,
}: {
  groupLabel: string;
  variants: Variant[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  if (variants.length === 0) return null;

  return (
    <fieldset className={cn('m-0 border-0 p-0', className)}>
      <legend className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
        {groupLabel}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {variants.map((v) => {
          const selected = v.id === selectedId;
          return (
            <button
              key={v.id}
              type="button"
              disabled={!v.available}
              aria-pressed={selected}
              onClick={() => onSelect?.(v.id)}
              className={cn(
                'bg-muted rounded-element px-4 py-2 text-13 font-bold transition-colors',
                selected && 'bg-foreground text-background',
                !v.available && 'cursor-not-allowed line-through opacity-40',
                v.available && !selected && 'hover:bg-foreground hover:text-background',
              )}
            >
              {v.label}
              {!v.available && <span className="sr-only"> — sold out</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
