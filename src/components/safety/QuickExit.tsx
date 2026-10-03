/**
 * QuickExit — explicit "leave this page now" button for /help.
 *
 * Replaces location with a neutral page (default: weather.com) and scrubs the
 * back stack via history.replaceState so the visitor can't be returned to
 * /help with the back button. It is deliberately not bound globally to Escape:
 * Escape must keep its platform-standard job of closing a dialog or sheet.
 *
 * Crisis-UX standard pattern (used by DV, LGBTQ, abortion-info sites).
 */

import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { performQuickExit } from './perform-quick-exit';

export function QuickExit() {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={performQuickExit}
      className="inline-flex min-h-11 items-center gap-2 bg-foreground px-4 text-13 font-bold text-background"
      aria-label={t('help.quick_exit_aria', 'Leave this page immediately')}
    >
      <LogOut size={16} aria-hidden="true" />
      {t('help.quick_exit', 'Quick exit')}
    </button>
  );
}
