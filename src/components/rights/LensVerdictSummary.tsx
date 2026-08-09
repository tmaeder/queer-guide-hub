import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeRightsProfile } from '../../../supabase/functions/_shared/rights/verdict.ts';
import type {
  RightsLens,
  Verdict,
} from '../../../supabase/functions/_shared/rights/types.ts';

/**
 * Per-lens rights verdict for one country.
 *
 * Computed here rather than read from `countries.rights_verdicts`, because the
 * caller already holds the whole row — so the full evidence costs zero extra
 * bytes and zero extra queries. The stored column exists for SQL filters and
 * sorting, not for this.
 *
 * The point of the component is the SPLIT. A single number said Germany was
 * 100 and the United States 86, which concealed that the trans picture in both
 * is materially worse than the LGB one; 82 countries have LGB and trans
 * verdicts that disagree. Rendering one aggregate word would reintroduce
 * exactly that — and `general` is `worstOf()`, so with 228 of 250 countries
 * recording no intersex protection it collapses to "hostile" almost
 * everywhere.
 *
 * Additive by design: this sits alongside the equality score rather than
 * replacing it. Retiring the scalar touches trip safety, the recommendation
 * engine and a shareable `/cities?tiers=` URL contract, and belongs in its own
 * change.
 *
 * Monochrome. This is a crisis-adjacent surface, so `--destructive` is the
 * only permitted hue and it is reserved for criminalisation; every other state
 * is carried by weight and a plain word.
 */

const LENS_ORDER: readonly Exclude<RightsLens, 'general'>[] = ['lgb', 'trans', 'intersex'];

const LENS_LABEL: Record<Exclude<RightsLens, 'general'>, string> = {
  lgb: 'Lesbian, gay, bisexual',
  trans: 'Trans',
  intersex: 'Intersex',
};

const VERDICT_LABEL: Record<Verdict, string> = {
  'criminalized-severe': 'Criminalised — death penalty',
  criminalized: 'Criminalised',
  hostile: 'Few or no protections',
  partial: 'Some protections',
  protected: 'Broad protections',
  unknown: 'Not enough data',
};

function verdictClass(v: Verdict): string {
  if (v === 'criminalized' || v === 'criminalized-severe') return 'text-destructive font-semibold';
  if (v === 'unknown') return 'text-muted-foreground';
  return 'font-medium';
}

export function LensVerdictSummary({
  country,
  className = '',
}: {
  country: Record<string, unknown>;
  className?: string;
}) {
  const { t } = useTranslation();
  const profile = useMemo(() => computeRightsProfile(country), [country]);

  // Nothing measured at all — say so rather than rendering three empty rows.
  if (profile.general.verdict === 'unknown' && profile.lgb.verdict === 'unknown') {
    return (
      <p className={`text-13 text-muted-foreground ${className}`}>
        {t(
          'rights.lens.noData',
          'We hold no recorded legal status for this country or territory.',
        )}
      </p>
    );
  }

  return (
    <div className={className}>
      <p className="mb-2 text-xs2 font-bold uppercase tracking-[0.05em] text-muted-foreground">
        {t('rights.lens.title', 'Who the law protects')}
      </p>

      {/*
        A plate, not ruled rows. Borders were replaced by ink plates in the
        monochrome refactor, and /city/:slug carries a hard budget of 6 painted
        lines (e2e/design-system.spec.ts) which counts a border, a divide-y and
        a thin filled div alike. Three `border-b` rows here took it to 8 — the
        same mistake CompareRightsSideBySide had. Separation is the tonal step
        plus spacing.
      */}
      <ul className="list-none p-0 m-0 rounded-container bg-surface-container">
        {LENS_ORDER.map((lens) => {
          const v = profile[lens];
          return (
            <li
              key={lens}
              className="flex items-baseline justify-between gap-4 px-4 py-2 first:pt-4 last:pb-4"
            >
              <span className="text-13">{t(`rights.lens.${lens}`, LENS_LABEL[lens])}</span>
              <span className={`shrink-0 text-13 ${verdictClass(v.verdict)}`}>
                {t(`rights.verdict.${v.verdict}`, VERDICT_LABEL[v.verdict])}
              </span>
            </li>
          );
        })}
      </ul>

      {/*
        What ILGA does not record. Without this a green trans verdict reads as
        a promise about a passport check the dataset never made.
      */}
      {profile.trans.notCovered.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground max-w-prose">
          {t('rights.lens.notCovered', 'Not recorded by our source:')}{' '}
          {profile.trans.notCovered.slice(0, 3).join(', ').toLowerCase()}.
        </p>
      )}
    </div>
  );
}

export default LensVerdictSummary;
