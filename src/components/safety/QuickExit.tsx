/**
 * QuickExit — floating "leave this page now" button for /help.
 *
 * Replaces location with a neutral page (default: weather.com) and scrubs the
 * back stack via history.replaceState so the visitor can't be returned to
 * /help with the back button. Also bound to the ESC key.
 *
 * Crisis-UX standard pattern (used by DV, LGBTQ, abortion-info sites).
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NEUTRAL_URL = 'https://weather.com/';

export function performQuickExit(): void {
  try {
    // Push a neutral entry so the immediate back step lands on weather.com, not /help.
    window.history.replaceState(null, '', NEUTRAL_URL);
  } catch {
    // ignore
  }
  window.location.replace(NEUTRAL_URL);
}

export function QuickExit() {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') performQuickExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 sm:right-6">
      <Button
        type="button"
        variant="destructive"
        size="lg"
        onClick={performQuickExit}
        className="pointer-events-auto shadow-lg"
        aria-label={t('help.quick_exit_aria', 'Leave this page immediately (ESC)')}
      >
        <LogOut size={18} className="mr-2" />
        {t('help.quick_exit', 'Quick exit')}
      </Button>
    </div>
  );
}
