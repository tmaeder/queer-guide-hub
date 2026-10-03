/**
 * HideScreen — toggle that replaces the page with a neutral cover.
 * For when someone is reading /help in a shared/public space and needs to
 * hide it fast without leaving the page entirely (Quick Exit handles that).
 *
 * THE COVER IS PORTALED TO document.body, AND A RAISED z-index ALONE DOES NOT
 * WORK. Two separate things were wrong, and fixing only the obvious one still
 * leaves the product's name on screen:
 *
 * 1. It sat at `z-[100]`, which is exactly `--z-sticky`, the band the cookie
 *    consent banner occupies. The banner renders after the route content in
 *    LayoutShell, so at equal z-index DOM order wins and a bar reading
 *    "Queer Guide uses cookies" painted over the cover.
 * 2. More importantly, the cover renders inside LayoutShell's
 *    `<div className="relative z-10">` content wrapper, and `position:
 *    relative` + a z-index CREATES A STACKING CONTEXT. Any z-index set in here
 *    is resolved against its siblings inside that box and the whole box is
 *    pinned at 10 — below the header (40), the feedback FAB (45) and the
 *    banner (100). Raising the number to `--z-modal` (1200) changed nothing:
 *    verified in a browser, the header, the FAB and the cookie banner all
 *    still painted over the cover. This is the same trap Header.tsx documents
 *    having hit from the other side, where a z-1100 header was capped to 10 by
 *    the very same wrapper.
 *
 * Neither fault was reachable while /help suppressed the whole public chrome;
 * restoring the ordinary page shell is what exposed both. A cover that leaves
 * the site's wordmark and a cookie bar on screen is not a cover, so it escapes
 * the content wrapper entirely and then outranks every fixed layer above it.
 */

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HideScreen() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);

  const reveal = useCallback(() => setHidden(false), []);

  // Escape restores the page as well as a click. Someone who hit the button
  // because a person walked in should not have to find a target to get back.
  useEffect(() => {
    if (!hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHidden(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hidden]);

  if (hidden) {
    return createPortal(
      <div
        className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-background"
        role="button"
        tabIndex={0}
        onClick={reveal}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') reveal();
        }}
        aria-label={t('help.reveal_aria', 'Click anywhere to show the page again')}
      >
        <div className="max-w-sm px-4 text-center">
          <Eye size={32} className="mx-auto mb-4 opacity-60" />
          <p className="text-sm text-muted-foreground">
            {t('help.hidden_hint', 'Page hidden. Click anywhere to show again.')}
          </p>
        </div>
      </div>,
      document.body,
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
