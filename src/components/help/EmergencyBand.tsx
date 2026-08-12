/**
 * EmergencyBand — life-safety copy, first in the DOM and first on screen.
 *
 * Two things here are load-bearing:
 *
 * 1. It renders SYNCHRONOUSLY. Never gate it on i18n `ready` or the CMS fetch —
 *    every string has an inline English default, so first paint always carries
 *    an emergency number even if every network request fails.
 * 2. It is NOT sticky. It used to follow the reader for the full ~3000px scroll,
 *    which cost ~90px of every viewport AND trained blindness against the one
 *    other red thing on this page — the per-line "may contact police" warning,
 *    which is about danger to the reader rather than danger in the room. The
 *    emergency numbers stay permanently visible in the filter spine instead.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

export function EmergencyBand() {
  const { t } = useTranslation();

  return (
    <aside
      // Full-bleed inside PageContainer: the band's own rules ARE its edges, so
      // it cancels the page gutter and re-applies it to its content row. It must
      // stay a descendant of the container — a sibling would break the
      // header-alignment contract in e2e/page-layout.spec.ts.
      className="-mx-4 border-y-4 border-foreground bg-destructive text-destructive-foreground sm:-mx-6 md:-mx-8"
    >
      <div className="mx-auto flex max-w-page items-start gap-4 px-4 py-6 sm:px-6 md:px-8">
        <AlertTriangle className="mt-1 h-8 w-8 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-display text-headline leading-tight">
            {t('help.emergency_title', 'In acute danger?')}
          </h2>
          <p className="mt-1 text-15 leading-relaxed">
            {t(
              'help.emergency_body',
              'Call emergency services immediately: 112 (EU) or 911 (US/CA). Every second counts.',
            )}
          </p>
        </div>
      </div>
    </aside>
  );
}
