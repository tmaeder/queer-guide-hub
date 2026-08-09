import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Toggle theme">
          {isDark ? (
            <Moon style={{ height: '1.2rem', width: '1.2rem' }} />
          ) : (
            <Sun style={{ height: '1.2rem', width: '1.2rem' }} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* The wipe expands from the row that was pressed. `clientX` is 0 for
            keyboard-activated clicks, which is exactly when we want the
            provider's centre-of-viewport default, hence the `|| undefined`. */}
        {(['light', 'dark', 'system'] as const).map((mode) => (
          <DropdownMenuItem
            key={mode}
            onClick={(e) =>
              setTheme(mode, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : undefined)
            }
          >
            {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
