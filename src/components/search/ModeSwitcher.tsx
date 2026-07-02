import { useTranslation } from 'react-i18next';
import { useUserMode } from '@/hooks/useUserMode';
import { USER_MODES } from '@/config/navigation';
import { cn } from '@/lib/utils';

/**
 * Discovery-mode control in the search hub. Six modes; the active mode biases
 * trending tiles and scope ordering. A single compact non-wrapping chip row
 * (horizontal scroll on narrow screens) — monochrome radiogroup.
 */
export function ModeSwitcher() {
  const { t } = useTranslation();
  const { mode, setMode } = useUserMode();
  const activeLabel = USER_MODES.find((m) => m.value === mode)?.labelKey;

  return (
    <div
      role="radiogroup"
      aria-label={t('header.modeLabel', 'Mode')}
      className="flex items-center gap-1.5 overflow-x-auto px-4 py-2"
    >
      {USER_MODES.map((m) => {
        const active = mode === m.value;
        const Icon = m.icon;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(m.value)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-badge border px-2 py-1 text-xs transition-colors',
              active
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(m.labelKey)}
          </button>
        );
      })}
      <span role="status" aria-live="polite" className="sr-only">
        {activeLabel ? t('header.modeActive', { mode: t(activeLabel) }) : ''}
      </span>
    </div>
  );
}
