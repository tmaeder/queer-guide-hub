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
    <div className="pointer-events-none fixed right-4 top-24 z-50 sm:right-6">
      {/* Deliberately not <Button>: that base carries `active:scale-[0.98]`,
        and a scale transform is the wrong thing on the one control someone
        hits in a panic.

        text-xl + bold keeps this WCAG large text (>=14pt bold) — the size is
        also simply better crisis UX for a quick-exit affordance.

        The hard shadow is STATIC, never a hover reward: it reads as a physical
        sticker sitting above the page. And there is no hover colour change —
        red IS the signal here, so losing it on hover would lose the signal. */}
      <button
        type="button"
        onClick={performQuickExit}
        className="pointer-events-auto inline-flex items-center gap-2 bg-destructive px-6 py-4 text-xl font-bold text-destructive-foreground shadow-soft"
        aria-label={t('help.quick_exit_aria', 'Leave this page immediately (ESC)')}
      >
        <LogOut size={20} aria-hidden="true" />
        {t('help.quick_exit', 'Quick exit')}
      </button>
    </div>
  );
}
