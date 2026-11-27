import { HankyPocket } from '@/components/tags/HankyPocket';
import { HANKY_CODE } from '@/lib/flags';
import { useHankyVariants, type HankySide } from '@/hooks/useHankySignals';
import { cn } from '@/lib/utils';

const SIDE_LABEL: Record<HankySide, string> = {
  left: 'left · top',
  right: 'right · bottom',
  both: 'both pockets',
};

const GROUPS: { side: HankySide; title: string }[] = [
  { side: 'left', title: 'Top · left pocket' },
  { side: 'both', title: 'Either way · both pockets' },
  { side: 'right', title: 'Bottom · right pocket' },
];

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
  worn.sort(
    (a, b) =>
      Number(b.match) - Number(a.match) || a.entry.meaningEn.localeCompare(b.entry.meaningEn),
  );
  if (!worn.length) return null;

  // Full view: one group per pocket, so the side reads once as a heading
  // instead of on every row.
  if (!compact) {
    return (
      <div aria-label="Hanky code" role="group" className={cn('flex flex-col gap-6', className)}>
        {GROUPS.map(({ side, title }) => {
          const rows = worn.filter((w) => w.side === side);
          if (!rows.length) return null;
          return (
            <section key={side} aria-label={title} className="flex flex-col gap-2">
              <h4 className="text-2xs uppercase tracking-wide text-muted-foreground">{title}</h4>
              <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-2 p-0 sm:grid-cols-2">
                {rows.map(({ entry, match }) => (
                  <li
                    key={entry.id}
                    title={`${entry.colorEn} (${entry.meaningEn}), ${SIDE_LABEL[side]}${match ? ', matches you' : ''}`}
                    className={cn(
                      'flex items-center gap-2 rounded-badge',
                      match && 'bg-foreground/10 py-0.5 pl-0.5 pr-2 ring-2 ring-foreground',
                    )}
                  >
                    <HankyPocket color={entry.hex} side={side} size={36} />
                    <span className="flex min-w-0 flex-col text-sm leading-tight">
                      <span className="font-bold">{entry.meaningEn}</span>
                      <span className="text-muted-foreground">
                        {entry.colorEn}
                        {match ? ' · matches you' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

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
