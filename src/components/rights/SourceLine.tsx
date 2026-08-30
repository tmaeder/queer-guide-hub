import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';

const ILGA_URL = 'https://database.ilga.org/';

function formatUpdated(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * `enrichment_status.lgbti_rights` — why a country's rights profile reads the way it does.
 * Written by 20260830131211 and re-derived nightly by `import-ilga-data`.
 */
export type RightsProvenance = {
  state?: string | null;
  parent_name?: string | null;
  basis?: string | null;
  disputed?: boolean | null;
} | null;

/**
 * Where a rights claim came from and when it was last refreshed.
 *
 * Shared so every rights surface cites identically. `/country/:slug` did this
 * and `/rights` did not — the index page showed an equality score a hundred
 * times over with no source, no date and no definition, which is the one place
 * a reader most needs to know who is making the claim.
 *
 * NOT EVERY COUNTRY'S PROFILE COMES FROM ILGA, and citing ILGA for the ones that
 * do not is a provenance falsehood on the platform's highest-stakes data. ILGA
 * covers 239 national jurisdictions; the other 11 are either governed by a
 * parent state's law (shown as inherited, naming the parent) or carry a recorded
 * decision. Western Sahara is the sharp case: its criminalisation entry is our
 * own reading of a de-facto regime in a territory of disputed sovereignty, and
 * publishing that under ILGA's name would lend it authority ILGA never gave it.
 * Measured on prod 2026-08-30, before this: /country/western-sahara cited "ILGA
 * World Database" for exactly that claim.
 */
export function SourceLine({
  updatedAt,
  className = '',
  showLink = true,
  provenance = null,
}: {
  updatedAt?: unknown;
  className?: string;
  showLink?: boolean;
  provenance?: RightsProvenance;
}) {
  const { t } = useTranslation();
  const updated = formatUpdated(updatedAt);
  const state = provenance?.state ?? null;

  // A territory with no ILGA entry and no parent law to inherit. Cite ourselves,
  // and say plainly that the claim is contested rather than burying it.
  if (state === 'data_unavailable' || state === 'not_applicable') {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        {provenance?.disputed
          ? t(
              'country.rights.sourceDisputed',
              'Not covered by ILGA — disputed territory. Status shown reflects the law applied by the de-facto administering power.',
            )
          : t('country.rights.sourceNotCovered', 'Not covered by the ILGA World Database.')}
        {provenance?.basis ? ` ${provenance.basis}.` : null}
      </p>
    );
  }

  const label = t('country.rights.source', 'ILGA World Database');

  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      {showLink ? (
        <a
          href={ILGA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          <ExternalLink size={10} aria-hidden="true" />
          {label}
        </a>
      ) : (
        label
      )}
      {updated ? ` · ${t('country.rights.updated', 'Updated')} ${updated}` : null}
      {state === 'inherited' && provenance?.parent_name ? (
        <>
          {' · '}
          {/*
            The parent name is a separate node rather than an interpolated
            `{{parent}}`, so a locale that is missing this key cannot render the
            placeholder literally to a reader. Caught in test, where the i18n stub
            returns defaultValue verbatim and produced
            "... {{parent}} national law shown".
          */}
          {t('country.rights.sourceInherited', 'No separate ILGA entry — national law of')}{' '}
          {provenance.parent_name}
        </>
      ) : null}
    </p>
  );
}

/**
 * The same citation contract for the two TGEU datasets.
 *
 * Separate from `SourceLine` rather than parameterised, because the two are not
 * interchangeable and must never be swapped by accident: ILGA describes law,
 * TGEU's Trans Murder Monitoring describes documented killings. Attribution is
 * also the condition under which we use TMM at all — we publish aggregate counts
 * only, and every figure on the site links back to TGEU.
 */
export function TgeuSourceLine({
  href,
  label,
  updatedAt,
  className = '',
}: {
  href: string;
  label: string;
  updatedAt?: unknown;
  className?: string;
}) {
  const { t } = useTranslation();
  const updated = formatUpdated(updatedAt);

  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-foreground hover:underline"
      >
        <ExternalLink size={10} aria-hidden="true" />
        {label}
      </a>
      {' · '}
      {t('rights.trans.sourceOrg', 'TGEU — Trans Europe and Central Asia')}
      {updated ? ` · ${t('country.rights.updated', 'Updated')} ${updated}` : null}
    </p>
  );
}

export default SourceLine;
