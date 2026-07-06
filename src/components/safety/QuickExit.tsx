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
import { performQuickExit } from './perform-quick-exit';

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
      {/* text-xl + bold makes this WCAG large text (>=14pt bold): the
        dark-mode destructive red only reaches 3.59:1 with white, which clears
        the 3:1 large-text bar but not the 4.5:1 normal-text bar. Larger, bolder
        is also better crisis UX for a quick-exit affordance. */}
      <Button
        type="button"
        variant="destructive"
        size="lg"
        onClick={performQuickExit}
        className="pointer-events-auto text-xl font-bold"
        aria-label={t('help.quick_exit_aria', 'Leave this page immediately (ESC)')}
      >
        <LogOut size={20} className="mr-2" aria-hidden="true" />
        {t('help.quick_exit', 'Quick exit')}
      </Button>
    </div>
  );
}
