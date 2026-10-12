import { useTranslation } from 'react-i18next';
import { useUserMode } from '@/hooks/useUserMode';
import { USER_MODES } from '@/config/navigation';
import { cn } from '@/lib/utils';

/**
 * Discovery-mode control in the search hub. Six modes; the active mode biases
 * trending tiles and scope ordering. A compact responsive grid with one keyboard tab stop and arrow-key selection.
 */
export function ModeSwitcher() {
  const { t } = useTranslation();
  const { mode, setMode } = useUserMode();
  const activeLabel = USER_MODES.find((m) => m.value === mode)?.labelKey;

  return (
    <div
      role="radiogroup"
      aria-label={t('header.modeLabel', 'Mode')}
      className="grid grid-cols-2 gap-1 px-4 pb-2 sm:grid-cols-3 sm:px-6"
    >
      {USER_MODES.map((m, index) => {
        const active = mode === m.value;
        const Icon = m.icon;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
                next = (index + 1) % USER_MODES.length;
              else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
                next = (index + USER_MODES.length - 1) % USER_MODES.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = USER_MODES.length - 1;
              else return;
              event.preventDefault();
              setMode(USER_MODES[next].value);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                [next]?.focus();
            }}
            onClick={() => setMode(m.value)}
            className={cn(
              'inline-flex min-h-10 min-w-0 cursor-pointer items-center gap-2 rounded-element px-2 py-2 text-left text-xs font-medium leading-snug transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'bg-transparent text-muted-foreground hover:bg-surface-container hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{t(m.labelKey)}</span>
          </button>
        );
      })}
      <span role="status" aria-live="polite" className="sr-only">
        {activeLabel ? t('header.modeActive', { mode: t(activeLabel) }) : ''}
      </span>
    </div>
  );
}
