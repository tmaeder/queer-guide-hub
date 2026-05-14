/**
 * HideScreen — toggle that blurs page contents and shows a neutral cover.
 * For when someone is reading /help in a shared/public space and needs to
 * hide it fast without leaving the page entirely (Quick Exit handles that).
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HideScreen() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);

  const reveal = useCallback(() => setHidden(false), []);

  if (hidden) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
        role="button"
        tabIndex={0}
        onClick={reveal}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') reveal();
        }}
        aria-label={t('help.reveal_aria', 'Click anywhere to show the page again')}
      >
        <div className="max-w-sm px-4 text-center">
          <Eye size={32} className="mx-auto mb-3 opacity-60" />
          <p className="text-sm text-muted-foreground">
            {t('help.hidden_hint', 'Page hidden. Click anywhere to show again.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setHidden(true)}
      aria-label={t('help.hide_screen', 'Hide screen')}
    >
      <EyeOff size={14} className="mr-2" />
      {t('help.hide_screen', 'Hide screen')}
    </Button>
  );
}
