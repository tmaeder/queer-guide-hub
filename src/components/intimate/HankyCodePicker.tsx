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

const SIDE_MEANING: Record<HankySide, string> = {
  left: 'top / giving',
  right: 'bottom / receiving',
  both: 'either',
};

const SIDES: { value: HankySide; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
];

interface HankyCodePickerProps {
  /** Controlled mode (e.g. the colours you are looking for). Omit both to edit
   *  the colours you wear, saved straight to user_hanky_signals. */
  value?: Record<string, HankySide>;
  onChange?: (variantId: string, side: HankySide | null) => void;
  /** Called with your full set after each saved change (own-signals mode). */
  onWornChange?: (signals: Record<string, HankySide>) => void;
  help?: string;
}

/** Pick hanky colours and the pocket for each. */
export function HankyCodePicker({
  value,
  onChange,
  onWornChange,
  help,
}: HankyCodePickerProps = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: variants } = useHankyVariants();
  const controlled = !!onChange;
  const { data: saved = {} } = useMyHankySignals();
  const mine = controlled ? (value ?? {}) : saved;
  const setSignal = useSetHankySignal();
  const pending = !controlled && setSignal.isPending;

  if (!variants?.length) return null;
  const variantOf = new Map(variants.map((v) => [v.colorId, v.variantId]));
  const rows = [...HANKY_CODE]
    .sort((a, b) => colourOrder(a.hex) - colourOrder(b.hex))
    .flatMap((entry) => {
      const variantId = variantOf.get(entry.id);
      return variantId ? [{ entry, variantId }] : [];
    });

  const set = (variantId: string, side: HankySide | null) => {
    if (onChange) return onChange(variantId, side);
    setSignal.mutate(
      { variantId, side },
      {
        onSuccess: () => {
          const next = { ...saved };
          if (side) next[variantId] = side;
          else delete next[variantId];
          onWornChange?.(next);
        },
        onError: (e) =>
          toast({ title: 'Could not save', description: String(e), variant: 'destructive' }),
      },
    );
  };

  const worn = rows.filter((r) => mine[r.variantId]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {help ??
          t(
            'intimate.hanky.helpMembers',
            'Each colour is a kink. Wear it on the left pocket if you give or top, the right if you receive or bottom, both if you do either. Shown to other opted-in members.',
          )}
      </p>
      <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-2">
        {rows.map(({ entry, variantId }) => {
          const side = mine[variantId];
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={!!side}
              disabled={pending}
              title={t(entry.meaningKey, entry.meaningEn)}
              onClick={() => set(variantId, side ? null : 'left')}
              className={cn(
                'relative flex min-h-0 w-24 shrink-0 snap-start flex-col items-center gap-1 rounded-element px-1 pb-1.5 pt-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
                side ? 'bg-foreground text-background' : 'bg-muted hover:bg-surface-container-high',
              )}
            >
              <HankyPocket color={entry.hex} side={side ?? 'left'} size={56} />
              <span className="w-full truncate text-center text-2xs font-bold leading-tight">
                {t(entry.colorKey, entry.colorEn)}
              </span>
              <span
                className={cn(
                  'line-clamp-2 w-full text-center text-2xs leading-tight',
                  side ? 'text-background/80' : 'text-muted-foreground',
                )}
              >
                {t(entry.meaningKey, entry.meaningEn)}
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
            <li
              key={entry.id}
              className="flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-2 py-2"
            >
              <HankyPocket
                color={entry.hex}
                side={mine[variantId]}
                size={44}
                className="shrink-0"
              />
              <span className="flex min-w-0 flex-1 flex-col text-sm leading-tight">
                <span className="font-bold">{t(entry.colorKey, entry.colorEn)}</span>
                <span className="text-muted-foreground">
                  {t(entry.meaningKey, entry.meaningEn)}
                </span>
              </span>
              <div
                role="group"
                aria-label={t('intimate.hanky.sideFor', 'Pocket for {{color}}', {
                  color: t(entry.colorKey, entry.colorEn),
                })}
                // Its own row: three two-line chips never fit beside the colour.
                className="grid w-full grid-cols-3 gap-1"
              >
                {SIDES.map((s) => (
                  <ToggleChip
                    key={s.value}
                    className="w-full min-w-0 justify-center"
                    pressed={mine[variantId] === s.value}
                    disabled={pending}
                    onPressedChange={() => set(variantId, s.value)}
                  >
                    <span className="flex min-w-0 flex-col items-center leading-tight">
                      <span>{t(`intimate.hanky.side.${s.value}`, s.label)}</span>
                      <span className="whitespace-normal text-center text-2xs font-normal opacity-70">
                        {t(`intimate.hanky.sideMeaning.${s.value}`, SIDE_MEANING[s.value])}
                      </span>
                    </span>
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

/** Rainbow order by hue; greys and black/white last, light to dark. */
function colourOrder(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.15) return 1000 - max * 100;
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  // +15° so near-360 red sorts first, not last.
  return (h * 60 + 15) % 360;
}
