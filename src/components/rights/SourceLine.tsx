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
 * Where a rights claim came from and when it was last refreshed.
 *
 * Shared so every rights surface cites identically. `/country/:slug` did this
 * and `/rights` did not — the index page showed an equality score a hundred
 * times over with no source, no date and no definition, which is the one place
 * a reader most needs to know who is making the claim.
 */
export function SourceLine({
  updatedAt,
  className = '',
  showLink = true,
}: {
  updatedAt?: unknown;
  className?: string;
  showLink?: boolean;
}) {
  const { t } = useTranslation();
  const updated = formatUpdated(updatedAt);

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
          {t('country.rights.source', 'ILGA World Database')}
        </a>
      ) : (
        t('country.rights.source', 'ILGA World Database')
      )}
      {updated ? ` · ${t('country.rights.updated', 'Updated')} ${updated}` : null}
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
