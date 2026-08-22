// src/components/rights/RightsLedger.tsx
import { useTranslation } from 'react-i18next';
import {
  RIGHT_SECTION_ORDER,
  RIGHT_SECTION_LABEL,
  topicListLabel,
} from '@/lib/rights/rightsCatalog';
import type { RightWorldSummary } from '@/lib/rights/rightsWorldSummary';

/**
 * The 18 rights as a dense ledger: one row per right, grouped by section.
 * Compresses the former 2-col card grid to roughly half its height while
 * keeping every anchor (`/rights#<slug>`) and every honesty rule — an
 * uncounted right renders without a number rather than being dropped.
 *
 * The marriage / civil-union label disambiguation lived here as a private
 * const until the map's line selector needed exactly the same fix and did not
 * get it — shipping two adjacent buttons both reading "Same-sex unions". It is
 * `topicListLabel` in the catalog now, so the next flat list of topics cannot
 * repeat that.
 */

export function RightsLedger({ summary }: { summary: RightWorldSummary[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-x-12">
      {RIGHT_SECTION_ORDER.map((sectionId) => {
        const rows = summary.filter((r) => r.topic.section === sectionId);
        if (rows.length === 0) return null;
        return (
          <div key={sectionId}>
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              {RIGHT_SECTION_LABEL[sectionId]}
            </h3>
            <ul className="list-none p-0 m-0">
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
                    // Anchor target for `/rights#<slug>` — glossary tags that
                    // name a class of law link here (see tagRightTopics.ts).
                    id={topic.slug}
                    className="flex items-center gap-4 border-b border-border py-2 scroll-mt-24"
                  >
                    <Icon size={16} aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 flex-1 font-medium">{topicListLabel(topic, t)}</span>
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
                          className="hidden h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted sm:block"
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
