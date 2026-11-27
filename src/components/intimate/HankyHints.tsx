import { Button } from '@/components/ui/button';
import { useHankyVariants, useMyHankySignals, type HankySide } from '@/hooks/useHankySignals';
import { useMyKinkRatings } from '@/hooks/useKinkRatings';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { HANKY_CODE } from '@/lib/flags/hankyCode';
import { hankyChecks } from '@/lib/intimate/hankyChecks';

/** Mismatches between your hanky, what you look for and your checklist. Hints only. */
export function HankyHints({
  wanted,
  onFix,
}: {
  wanted: Record<string, HankySide>;
  onFix: (variantId: string, side: HankySide) => void;
}) {
  const { data: variants } = useHankyVariants();
  const { data: signals } = useMyHankySignals();
  const { data: ratings } = useMyKinkRatings();
  const { data: taxonomy } = useKinkTaxonomy();
  const colorOf = new Map((variants ?? []).map((v) => [v.variantId, v.colorId]));
  const worn: Record<string, HankySide> = {};
  for (const [variantId, side] of Object.entries(signals ?? {})) {
    const color = colorOf.get(variantId);
    if (color) worn[color] = side;
  }
  // Seeking is keyed by variant id, like the signals.
  const wantedByColor: Record<string, HankySide> = {};
  for (const [variantId, side] of Object.entries(wanted)) {
    const color = colorOf.get(variantId);
    if (color) wantedByColor[color] = side;
  }
  const variantOf = new Map((variants ?? []).map((v) => [v.colorId, v.variantId]));
  const items = new Map((taxonomy?.items ?? []).map((i) => [i.slug, i]));
  const checks = hankyChecks({
    worn,
    wanted: wantedByColor,
    label: (c) => {
      const e = HANKY_CODE.find((h) => h.id === c);
      return e ? `${e.colorEn} (${e.meaningEn})` : c;
    },
    itemLabel: (slug) => items.get(slug)?.label ?? slug,
    rating: (slug, side) => {
      const item = items.get(slug);
      return item ? ratings?.get(`${item.id}:${side}`)?.rating : undefined;
    },
  });
  if (!checks.length) return null;
  return (
    <section aria-label="Worth a second look" className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">Worth a second look</h4>
      <ul className="flex flex-col gap-2">
        {checks.map((c) => (
          <li
            key={`${c.kind}:${c.colorId}`}
            className="flex flex-wrap items-center gap-2 rounded-element bg-muted p-2 text-sm"
          >
            <span className="flex-1">{c.message}</span>
            {c.fixSide && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-element"
                onClick={() => onFix(variantOf.get(c.colorId) ?? c.colorId, c.fixSide!)}
              >
                Look for {c.fixSide} instead
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
