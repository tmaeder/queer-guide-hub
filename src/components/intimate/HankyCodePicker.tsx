import { useTranslation } from 'react-i18next';
import { HANKY_CODE } from '@/lib/flags';
import { cn } from '@/lib/utils';
import { HankyPocket } from '@/components/tags/HankyPocket';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { useToast } from '@/hooks/use-toast';
import {
  useHankyVariants,
  useMyHankySignals,
  useSetHankySignal,
  type HankySide,
} from '@/hooks/useHankySignals';

const SIDE_LETTER: Record<HankySide, string> = { left: 'L', right: 'R', both: 'L·R' };

const SIDES: { value: HankySide; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
];

/** Pick the hanky colours you wear and on which side. Private to you. */
export function HankyCodePicker() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: variants } = useHankyVariants();
  const { data: mine = {} } = useMyHankySignals();
  const setSignal = useSetHankySignal();

  if (!variants?.length) return null;
  const variantOf = new Map(variants.map((v) => [v.colorId, v.variantId]));
  const rows = HANKY_CODE.flatMap((entry) => {
    const variantId = variantOf.get(entry.id);
    return variantId ? [{ entry, variantId }] : [];
  });

  const set = (variantId: string, side: HankySide | null) =>
    setSignal.mutate(
      { variantId, side },
      {
        onError: (e) =>
          toast({ title: 'Could not save', description: String(e), variant: 'destructive' }),
      },
    );

  const worn = rows.filter((r) => mine[r.variantId]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {t(
          'intimate.hanky.help',
          'Left pocket = top / giving, right = bottom / receiving. Saved privately. Only you see it.',
        )}
      </p>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
        {rows.map(({ entry, variantId }) => {
          const side = mine[variantId];
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={!!side}
              disabled={setSignal.isPending}
              title={t(entry.meaningKey, entry.meaningEn)}
              onClick={() => set(variantId, side ? null : 'left')}
              className={cn(
                'relative flex min-h-0 flex-col items-center gap-1 rounded-element px-1 pb-1.5 pt-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
                side ? 'bg-foreground text-background' : 'bg-muted hover:bg-surface-container-high',
              )}
            >
              <HankyPocket color={entry.hex} side={side ?? 'left'} size={56} />
              <span className="w-full truncate text-center text-2xs font-bold leading-tight">
                {t(entry.colorKey, entry.colorEn)}
              </span>
              {side && (
                <span className="absolute end-1 top-1 rounded-badge bg-background px-1 font-display text-2xs text-foreground">
                  {SIDE_LETTER[side]}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {worn.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {worn.map(({ entry, variantId }) => (
            <li key={entry.id} className="flex min-h-12 items-center gap-2.5 py-2">
              <HankyPocket
                color={entry.hex}
                side={mine[variantId]}
                size={44}
                className="shrink-0"
              />
              <span className="flex-1 text-sm">
                <span className="font-bold">{t(entry.colorKey, entry.colorEn)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {t(entry.meaningKey, entry.meaningEn)}
                </span>
              </span>
              <div
                role="group"
                aria-label={t('intimate.hanky.sideFor', 'Pocket for {{color}}', {
                  color: t(entry.colorKey, entry.colorEn),
                })}
                className="flex gap-1"
              >
                {SIDES.map((s) => (
                  <ToggleChip
                    key={s.value}
                    pressed={mine[variantId] === s.value}
                    disabled={setSignal.isPending}
                    onPressedChange={() => set(variantId, s.value)}
                  >
                    {t(`intimate.hanky.side.${s.value}`, s.label)}
                  </ToggleChip>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
