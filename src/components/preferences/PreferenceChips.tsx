import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Accessibility, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';
import type { PreferenceChip } from '@/hooks/usePreferenceChips';

interface PreferenceChipsProps {
  chips: PreferenceChip[];
  onToggle: (id: string) => void;
  onForget: (chip: PreferenceChip) => void;
  className?: string;
}

const LONG_PRESS_MS = 500;

/**
 * The user's saved preferences as live chips, traveling with them across
 * search surfaces. Tap toggles a chip off for this session; the menu
 * (chevron or long-press) edits in settings or forgets permanently.
 */
export function PreferenceChips({ chips, onToggle, onForget, className }: PreferenceChipsProps) {
  const { t } = useTranslation();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressed = useRef(false);

  if (chips.length === 0) return null;

  const startPress = (id: string) => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuFor(id);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      role="group"
      aria-label={t('prefs.chips.groupLabel', 'Your saved preferences')}
    >
      <span className="text-2xs uppercase tracking-wider text-muted-foreground">
        {t('prefs.chips.yours', 'Yours')}
      </span>
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex items-stretch overflow-hidden rounded-badge border border-border"
        >
          <button
            type="button"
            aria-pressed={chip.active}
            title={
              chip.active
                ? t('prefs.chips.tapOff', 'Applied — tap to turn off for this session')
                : t('prefs.chips.tapOn', 'Off for this session — tap to apply')
            }
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 text-xs transition-colors',
              chip.active
                ? 'bg-foreground text-background'
                : 'bg-background text-muted-foreground line-through hover:bg-muted',
            )}
            onClick={() => {
              if (longPressed.current) return; // long-press opened the menu
              onToggle(chip.id);
            }}
            onPointerDown={() => startPress(chip.id)}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuFor(chip.id);
            }}
          >
            {chip.kind === 'accessibility' && <Accessibility size={12} aria-hidden="true" />}
            {chip.label}
          </button>
          <DropdownMenu
            open={menuFor === chip.id}
            onOpenChange={(open) => setMenuFor(open ? chip.id : null)}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('prefs.chips.options', 'Options for {{label}}', {
                  label: chip.label,
                })}
                className="inline-flex items-center border-l border-border bg-background px-1 text-muted-foreground hover:bg-muted"
              >
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <LocalizedLink to="/settings">
                  {t('prefs.chips.edit', 'Edit in settings')}
                </LocalizedLink>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onForget(chip)}>
                {t('prefs.chips.forget', 'Forget permanently')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ))}
    </div>
  );
}
