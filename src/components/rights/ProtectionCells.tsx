import { useTranslation } from 'react-i18next';
import type { ProtectionAttr } from '@/lib/rights/rightsCatalog';
import { getProtectionStatus } from '@/utils/equalityScore';

const ALL_ATTRS: readonly ProtectionAttr[] = ['so', 'gi', 'ge', 'sc'];

const ATTR_FULL: Record<ProtectionAttr, string> = {
  so: 'Sexual orientation',
  gi: 'Gender identity',
  ge: 'Gender expression',
  sc: 'Sex characteristics',
};

/**
 * The SO / GI / GE / SC cells of an anti-discrimination row.
 *
 * `attrs` narrows which columns render, which is what an identity lens will
 * use later — a trans lens shows GI and GE, an intersex lens shows SC. The
 * default is all four, matching the country card today.
 *
 * Accessibility: the meaning used to live only in a `title` attribute, which
 * screen readers do not reliably announce and touch devices cannot reveal at
 * all. Each cell now carries an explicit accessible name.
 */
export function ProtectionCells({
  data,
  attrs = ALL_ATTRS,
}: {
  data: Record<string, unknown> | null | undefined;
  attrs?: readonly ProtectionAttr[];
}) {
  const { t } = useTranslation();
  const status = getProtectionStatus(data);

  return (
    <div className="flex shrink-0 gap-1">
      {attrs.map((attr) => {
        const value = status[attr];
        const isYes = value === 'Yes';
        const isNo = value === 'No';
        const full = t(`rights.attr.${attr}.full`, ATTR_FULL[attr]);
        return (
          <span
            key={attr}
            title={`${attr.toUpperCase()}: ${value}`}
            aria-label={`${full}: ${value}`}
            className={
              'flex h-5 w-6 items-center justify-center rounded-badge text-2xs font-semibold ' +
              (isYes
                ? 'bg-foreground text-background'
                : isNo
                  ? 'bg-surface-container-highest text-muted-foreground'
                  : 'bg-muted text-muted-foreground')
            }
          >
            <span aria-hidden="true">{attr.toUpperCase()}</span>
          </span>
        );
      })}
    </div>
  );
}

/** The column header strip above a run of ProtectionCells. */
export function ProtectionCellsHeader({ attrs = ALL_ATTRS }: { attrs?: readonly ProtectionAttr[] }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {attrs.map((attr) => (
        <span key={attr} className="w-6 text-center text-3xs font-semibold text-muted-foreground">
          {attr.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

export default ProtectionCells;
