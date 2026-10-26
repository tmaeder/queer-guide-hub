import { Moon, Sun } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from './ThemeProvider';

/**
 * Light / Dark / System switch. Rendered in the footer's legal row and in the
 * mobile nav sheet's Display section.
 *
 * Every string here was hardcoded English in an 11-locale product until
 * 2026-10-10 — the trigger's `aria-label` and all three menu items. Nothing in
 * this component went through `t()`.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('theme.toggle', 'Toggle theme')}>
          {/* `size-5` (20px) rather than an inline `1.2rem`: a bare rem value
              is off every scale in the system and matched no sibling icon. The
              switchers beside this one use `size={16}`–`size={20}`. */}
          {isDark ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          {t('theme.light', 'Light')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          {t('theme.dark', 'Dark')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          {t('theme.system', 'System')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
