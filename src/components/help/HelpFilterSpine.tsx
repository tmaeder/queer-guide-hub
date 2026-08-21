/**
 * HelpFilterSpine — the directory's control bar.
 *
 * Only the top row is sticky, and it is the page's ONLY sticky element. It
 * carries the emergency numbers permanently, which is what buys the freedom to
 * un-stick the red band: 112/911 stay one tap away for the whole scroll without
 * a persistent red slab competing with the per-line police warning.
 *
 * Topic filtering is chips, not a `<Select>`. With 1–6 lines in a typical
 * country scope a dropdown over topics is theatre, so the row only appears once
 * the result set is big enough to be worth narrowing. The Population/
 * intersections select that used to sit here was deleted outright: the field is
 * empty on every row, so it was gated on a length that is always zero and had
 * never rendered in production.
 */

import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PAGE_BLEED, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';

/** Below this the reader can just read the list. */
const CHIP_THRESHOLD = 8;

export function HelpFilterSpine({
  search,
  onSearch,
  topics,
  topic,
  onTopic,
  resultCount,
  totalCount,
  onReset,
}: {
  search: string;
  onSearch: (v: string) => void;
  topics: string[];
  topic: string;
  onTopic: (v: string) => void;
  resultCount: number;
  totalCount: number;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const showChips = totalCount > CHIP_THRESHOLD && topics.length > 1;
  const filtered = search.trim() !== '' || topic !== 'ALL';

  return (
    <>
      {/* Both geometry values come from PageContainer. This bar hand-rolled
          `top-16` and its own `-mx-4 sm:-mx-6 md:-mx-8`, and the `top-16` was
          the pre-island header height — so once the chrome became a floating
          island this sat 18px BEHIND it, measured on prod 2026-08-21. On the
          crisis directory that is the emergency-numbers row being clipped, so
          it is the one page where this cannot be cosmetic. */}
      <div
        className={cn(
          'sticky z-30 border-b border-border-hairline bg-background',
          PAGE_BLEED,
          STICKY_UNDER_HEADER,
        )}
      >
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6 md:px-8">
          <p className="flex items-center gap-2 whitespace-nowrap text-13">
            <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t('help.emergency_short', 'Emergency')}
            </span>
            <a href="tel:112" className="font-bold tabular-nums no-underline hover:underline">
              112
            </a>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <a href="tel:911" className="font-bold tabular-nums no-underline hover:underline">
              911
            </a>
          </p>
          <div className="relative min-w-[200px] flex-1">
            <label htmlFor="help-search" className="sr-only">
              {t('help.search_placeholder', 'Search hotlines')}
            </label>
            <Input
              id="help-search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t('help.search_placeholder', 'Search hotlines')}
            />
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {(showChips || filtered) && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {showChips && (
            <>
              <button
                type="button"
                onClick={() => onTopic('ALL')}
                aria-pressed={topic === 'ALL'}
                className={`shrink-0 border-border-hairline px-4 py-1 text-13 font-bold transition-colors ${
                  topic === 'ALL'
                    ? 'bg-foreground text-background'
                    : 'bg-background hover:bg-surface-container'
                }`}
              >
                {t('help.filter_topic_all', 'All topics')}
              </button>
              {topics.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => onTopic(tp)}
                  aria-pressed={topic === tp}
                  className={`shrink-0 border-border-hairline px-4 py-1 text-13 font-bold transition-colors ${
                    topic === tp
                      ? 'bg-foreground text-background'
                      : 'bg-background hover:bg-surface-container'
                  }`}
                >
                  {t(`help.topic.${tp}`, tp)}
                </button>
              ))}
            </>
          )}
          {filtered && (
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 text-13 underline underline-offset-4"
            >
              {t('help.reset_filters', 'Reset filters')}
            </button>
          )}
        </div>
      )}

      {/* A count, never the grid itself — announcing a whole list of cards on
          every keystroke is what makes a live region hostile with a reader. */}
      <p role="status" className="mt-4 text-13 text-muted-foreground">
        {t('help.result_count', '{{count}} lines', { count: resultCount })}
      </p>
    </>
  );
}
