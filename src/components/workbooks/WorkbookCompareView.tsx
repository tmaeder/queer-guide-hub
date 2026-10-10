/**
 * The reveal: answers both people chose to share, side by side.
 *
 * Every row here is already mutual by the time it arrives —
 * `workbook_compare` only emits a step when both sides set `shared`, so this
 * component does no filtering and must not add any. It is a renderer.
 *
 * A MENU ROW IS NOT A MISSING ANSWER.
 *
 * `kind='menu'` rows come back with null bodies and a `kink_category_slug`,
 * because a menu step's content is kink ratings and revealing those IS a
 * kink-list compare — gated by a `kind='compare'` grant, which is a separate
 * decision from the `workbook` grant that unlocked this view. Rendering such a
 * row as "no answer" would misreport a deliberate second gate as an empty
 * field, so it is labelled and pointed at the checklist instead.
 */

import { useTranslation } from 'react-i18next';
import { ArrowRight, Columns2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { WorkbookCompareRow } from '@/hooks/useWorkbookAnswers';

export function WorkbookCompareView({
  rows,
  className,
}: {
  rows: WorkbookCompareRow[];
  className?: string;
}) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    // Says nothing about WHY. The RPC cannot distinguish "no consent" from "no
    // overlap" by design, so neither does this copy.
    return (
      <p className={cn('text-13 italic text-muted-foreground', className)}>
        {t('workbooks.compare.empty', 'Nothing to compare yet.')}
      </p>
    );
  }

  return (
    <div className={className}>
      <h3 className="inline-flex items-center gap-1.5 font-display text-headline leading-tight">
        <Columns2 className="h-4 w-4" aria-hidden="true" />
        {t('workbooks.compare.title', 'Side by side')}
      </h3>

      <ul className="mt-4 list-none space-y-4 p-0">
        {rows.map((row) => (
          <li key={row.step_key} className="rounded-container bg-surface-container p-6">
            <p className="text-13 font-bold">{row.heading ?? row.prompt_md ?? row.step_key}</p>

            {row.step_kind === 'menu' ? (
              <div className="mt-4">
                <Badge variant="outline" className="rounded-badge text-2xs">
                  {t('workbooks.compare.menuRow', 'Rated menu')}
                </Badge>
                <p className="mt-2 text-13 text-muted-foreground">
                  {t(
                    'workbooks.compare.menuNote',
                    'Overlap on rated menus lives in your interests & boundaries comparison, which is shared separately.',
                  )}
                </p>
                <LocalizedLink
                  to="/tools/checklist"
                  className="mt-2 inline-flex items-center gap-2 text-13 font-bold no-underline"
                >
                  {t('workbooks.compare.openChecklist', 'Open the checklist')}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </LocalizedLink>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-2xs uppercase tracking-label text-muted-foreground">
                    {t('workbooks.compare.you', 'You')}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-13">{row.my_body}</p>
                </div>
                <div className="border-t border-border-hairline pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <p className="text-2xs uppercase tracking-label text-muted-foreground">
                    {t('workbooks.compare.them', 'Them')}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-13">{row.their_body}</p>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
