// src/components/rights/RightsLedger.tsx
import { useTranslation } from 'react-i18next';
import {
  RIGHT_SECTION_ORDER,
  RIGHT_SECTION_LABEL,
  topicListLabel,
  type RightTopic,
} from '@/lib/rights/rightsCatalog';
import type { RightWorldSummary } from '@/lib/rights/rightsWorldSummary';

/**
 * The 18 rights as a dense ledger: one row per right, grouped by section.
 * Compresses the former 2-col card grid to roughly half its height while
 * keeping every anchor (`/tags/rights-by-country#<slug>`) and every honesty rule — an
 * uncounted right renders without a number rather than being dropped.
 *
 * The marriage / civil-union label disambiguation lived here as a private
 * const until the map's line selector needed exactly the same fix and did not
 * get it — shipping two adjacent buttons both reading "Same-sex unions". It is
 * `topicListLabel` in the catalog now, so the next flat list of topics cannot
 * repeat that.
 */

export function RightsLedger({
  summary,
  onNewsTopicSelect,
}: {
  summary: RightWorldSummary[];
  onNewsTopicSelect?: (topic: RightTopic) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-x-12">
      {RIGHT_SECTION_ORDER.map((sectionId) => {
        const rows = summary.filter((r) => r.topic.section === sectionId);
        if (rows.length === 0) return null;
        return (
          // One card per group, so the groups read as separate areas.
          <div key={sectionId} className="rounded-container bg-card p-4 shadow-soft md:p-6">
            <h3 className="mb-4 text-13 font-bold uppercase tracking-wide">
              {RIGHT_SECTION_LABEL[sectionId]}
            </h3>
            <ul className="m-0 list-none divide-y divide-border-hairline p-0">
              {rows.map(({ topic, yes, no, measured, uncounted }) => {
                const Icon = topic.icon;
                // The bar shows the counted share of measured countries; for
                // severeNegative rights the counted direction is `no`
                // (criminalisation), matching the sentence beside it.
                const count = topic.severeNegative ? no : yes;
                const pct = measured > 0 ? Math.round((count / measured) * 100) : 0;
                return (
                  <li
                    key={topic.slug}
                    // Anchor target for `/tags/rights-by-country#<slug>` — glossary tags that
                    // name a class of law link here (see tagRightTopics.ts).
                    id={topic.slug}
                    className="grid scroll-mt-24 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 py-4"
                  >
                    <span className="row-span-2 grid size-10 place-items-center rounded-full bg-muted">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 font-bold">{topicListLabel(topic, t)}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                      {uncounted ? (
                        // WITHOUT a number rather than dropped: an omitted right
                        // reads as "this does not exist"; an uncounted one reads
                        // as what it is.
                        <span className="text-13 text-muted-foreground">
                          Recorded per country — open a country to read it.
                        </span>
                      ) : (
                        <>
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
                          >
                            <span
                              className="block h-full bg-foreground/60"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="whitespace-nowrap text-13 text-muted-foreground tabular-nums">
                            {topic.severeNegative
                              ? `${no} of ${measured} countries criminalise`
                              : topic.kind === 'protection-matrix'
                                ? // "fully" is load-bearing: the bar is all four of
                                  // SO/GI/GE/SC — partial protection is not counted.
                                  `${yes} of ${measured} countries fully protect`
                                : `${yes} of ${measured} countries protect`}
                          </span>
                        </>
                      )}
                      {onNewsTopicSelect ? (
                        <button
                          type="button"
                          onClick={() => onNewsTopicSelect(topic)}
                          className="ms-auto shrink-0 rounded-element bg-muted px-2 py-1 text-2xs font-bold text-foreground hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Latest coverage about ${topicListLabel(topic, t)}`}
                        >
                          Latest coverage
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default RightsLedger;
