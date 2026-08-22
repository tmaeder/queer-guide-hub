/**
 * CrisisBar — life-safety strip, first in the DOM and first on screen.
 *
 * Replaces the tall EmergencyBand + the lone HideScreen row above it. Three
 * things here are load-bearing:
 *
 * 1. It renders SYNCHRONOUSLY. Never gate it on i18n `ready` or the CMS fetch —
 *    every string has an inline English default, so first paint always carries
 *    an emergency number even if every network request fails.
 * 2. The numbers are tel: links, not prose. In the band era 112/911 were plain
 *    text inside a sentence; the one surface whose whole job is "dial this"
 *    was the one place you could not tap the number.
 * 3. It is NOT sticky. A persistent red slab trains blindness against the one
 *    other red thing on this page — the per-line "may contact police" warning.
 *    The emergency numbers stay permanently reachable in the filter spine.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { HideScreen } from '@/components/safety/HideScreen';

export function CrisisBar() {
  const { t } = useTranslation();

  return (
    <aside
      // Full-bleed inside PageContainer: the strip's own rules ARE its edges,
      // so it cancels the page gutter and re-applies it to its content row. It
      // must stay a descendant of the container — a sibling would break the
      // header-alignment contract in e2e/page-layout.spec.ts.
      className="-mx-4 border-y border-border-hairline bg-destructive text-destructive-foreground sm:-mx-6 md:-mx-8"
    >
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6 md:px-8">
        <h2 className="flex items-center gap-2 text-15 font-bold leading-tight">
          <AlertTriangle size={18} aria-hidden className="shrink-0" />
          {t('help.emergency_title', 'In acute danger?')}
        </h2>
        <p className="flex flex-wrap items-center gap-x-2 text-15 leading-tight">
          {t('help.emergency_call', 'Call now:')}{' '}
          <a href="tel:112" className="font-bold tabular-nums underline underline-offset-4">
            112
          </a>{' '}
          (EU)
          <span aria-hidden>·</span>
          <a href="tel:911" className="font-bold tabular-nums underline underline-offset-4">
            911
          </a>{' '}
          (US/CA)
        </p>
        <div className="ml-auto">
          <HideScreen />
        </div>
      </div>
    </aside>
  );
}
