import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useUserIntent,
  LOOKING_FOR_OPTIONS,
  LOOKING_FOR_LABELS,
} from '@/hooks/useUserIntent';

const intentChip = (active: boolean) =>
  cn(
    'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-element border px-2.5 py-2 text-xs transition-colors',
    active
      ? 'border-foreground bg-foreground text-background'
      : 'border-border text-muted-foreground hover:text-foreground',
  );

/**
 * The canonical "what you're looking for" chips. Single source of truth for
 * profiles.looking_for — rendered in the People IntentSheet, the unified
 * StatusEditor, and anywhere else intent is captured. Self-saving via
 * useUserIntent; no props needed.
 */
export function IntentChips() {
  const { t } = useTranslation();
  const { lookingFor, toggleLookingFor } = useUserIntent();

  return (
    <div className="flex flex-wrap gap-2">
      {LOOKING_FOR_OPTIONS.map((v) => {
        const active = lookingFor.includes(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => toggleLookingFor(v)}
            className={intentChip(active)}
          >
            {active && <Check className="h-3.5 w-3.5" aria-hidden />}
            <span className="whitespace-nowrap">
              {t(`people.intent.lookingForOptions.${v}`, LOOKING_FOR_LABELS[v])}
            </span>
          </button>
        );
      })}
    </div>
  );
}
