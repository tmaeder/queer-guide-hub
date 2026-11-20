import { HankyPocket } from '@/components/tags/HankyPocket';
import { HANKY_CODE } from '@/lib/flags';
import { useHankyVariants, type HankySide } from '@/hooks/useHankySignals';
import { cn } from '@/lib/utils';

const SIDE_LABEL: Record<HankySide, string> = {
  left: 'left · top',
  right: 'right · bottom',
  both: 'both pockets',
};

/** Another member's worn hanky colours (variant id → pocket). Compact mode is
 *  for list cards: pockets only, details in the tooltip and accessible name. */
export function HankyWorn({
  signals,
  compact = false,
  matching,
  className,
}: {
  signals?: Record<string, HankySide>;
  compact?: boolean;
  /** Variant ids that match you; highlighted and listed first. */
  matching?: Set<string>;
  className?: string;
}) {
  const { data: variants } = useHankyVariants();
  const colorOf = new Map((variants ?? []).map((v) => [v.variantId, v.colorId]));
  const worn = Object.entries(signals ?? {}).flatMap(([variantId, side]) => {
    const entry = HANKY_CODE.find((h) => h.id === colorOf.get(variantId));
    return entry ? [{ entry, side, match: !!matching?.has(variantId) }] : [];
  });
  worn.sort((a, b) => Number(b.match) - Number(a.match));
  if (!worn.length) return null;
  return (
    <ul
      aria-label="Hanky code"
      className={cn('m-0 flex list-none flex-wrap gap-2 p-0', compact && 'gap-1', className)}
    >
      {worn.map(({ entry, side, match }) => {
        const text = `${entry.colorEn} (${entry.meaningEn}), ${SIDE_LABEL[side]}${match ? ', matches you' : ''}`;
        return (
          <li
            key={entry.id}
            title={text}
            className={cn(
              'flex items-center gap-2 rounded-badge',
              match && 'bg-foreground/10 ring-2 ring-foreground',
              match && (compact ? 'p-0.5' : 'py-0.5 pl-0.5 pr-2'),
            )}
          >
            <HankyPocket color={entry.hex} side={side} size={compact ? 24 : 36} />
            {compact ? (
              <span className="sr-only">{text}</span>
            ) : (
              <span className="flex flex-col text-sm leading-tight">
                <span className="font-bold">{entry.colorEn}</span>
                <span className="text-muted-foreground">
                  {entry.meaningEn} · {SIDE_LABEL[side]}
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
