/**
 * DirectoryList — referral organisations and directories.
 *
 * These are websites, not lines where a person answers. Audit H-1: a user in
 * crisis must never be shown a website where they expect a phone. The old page
 * kept them structurally apart but rendered them in the SAME card shape as the
 * call-now grid, so the separation was invisible at a glance. A rules-and-rows
 * list reads as "a list of links" at a glance, which is the honest shape.
 *
 * Each row is a single click target, so it takes the ink hover-fill.
 */

import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import type { Hotline } from '@/types/cms';
import { countryLabel } from './helpData';

export function DirectoryList({ directories }: { directories: Hotline[] }) {
  const { t } = useTranslation();
  if (directories.length === 0) return null;

  return (
    <ul className="m-0 list-none border-[3px] border-foreground bg-background p-0">
      {directories.map((d) => {
        const live = d.url && d.link_status !== 'broken';
        return (
          <li key={d.id} className="border-b-2 border-foreground/10 last:border-b-0">
            {live ? (
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 p-4 text-inherit no-underline transition-colors hover:bg-foreground hover:text-background"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-title font-bold leading-tight">{d.name}</span>
                  <span className="mt-1 block text-13 leading-relaxed opacity-75">
                    {d.description}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-2xs font-bold uppercase tracking-label">
                  {countryLabel(d.country)}
                  <ExternalLink size={14} aria-hidden />
                </span>
              </a>
            ) : (
              <div className="flex items-start gap-4 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-title font-bold leading-tight">{d.name}</span>
                  <span className="mt-1 block text-13 leading-relaxed text-muted-foreground">
                    {t(
                      'help.link_unavailable',
                      'Website currently unavailable — being re-checked.',
                    )}
                  </span>
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
