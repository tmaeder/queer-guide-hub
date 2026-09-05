import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RIGHT_SECTION_LABEL, type RightSection } from '@/lib/rights/rightsCatalog';
import type { SectionSummary } from '@/lib/rights/sectionSummary';

/**
 * One collapsible section of the country rights card.
 *
 * The card rendered all 18 rights across 5 sections open, always, so the
 * question a traveller actually arrives with — is it legal, can I marry, can I
 * change my documents — sat below a seven-row anti-discrimination matrix and a
 * criminal-justice one. Everything is still here; four of the five sections
 * now start closed.
 *
 * The collapsed row must carry its count. Five identical closed drawers would
 * be worse than the wall they replace, because a reader could not tell "no
 * protections recorded" from "not opened yet" — hence `SectionSummary` and its
 * `recorded` field, which reports honest absence rather than a measured zero.
 *
 * `Collapsible` plus a hand-styled trigger is the public-surface convention
 * here (`TripSafetyBriefing`); `Accordion` is used only in admin and filter
 * sheets. Radix supplies `aria-expanded` and the content id wiring, so neither
 * is restated.
 *
 * Monochrome by rule. This is a crisis-adjacent surface — see the headers on
 * `RightsScopeBar` and `LensVerdictSummary` — so no track colour appears, and
 * `--destructive` stays reserved for criminal exposure inside the rows.
 */
export function RightsSection({
  section,
  summary,
  /** Rendered inside the open panel, above the rows (the SO/GI/GE/SC strip). */
  columnHeader,
  children,
}: {
  section: RightSection;
  summary: SectionSummary;
  columnHeader?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const label = t(`country.rights.section.${section}`, RIGHT_SECTION_LABEL[section]);
  const count =
    summary.recorded === 0
      ? t('country.rights.noData', 'No data')
      : t('country.rights.sectionCount', '{{covered}} of {{total}}', {
          covered: summary.covered,
          total: summary.total,
        });

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b border-border-hairline last:border-b-0"
    >
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center gap-4 py-4 text-start">
          <span className="flex-1 text-xs2 font-bold uppercase tracking-[0.05em] text-muted-foreground">
            {label}
          </span>
          <span className="shrink-0 text-13 font-bold tabular-nums">{count}</span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-muted-foreground transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {columnHeader && <div className="flex justify-end pb-2">{columnHeader}</div>}
        <div className="pb-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
