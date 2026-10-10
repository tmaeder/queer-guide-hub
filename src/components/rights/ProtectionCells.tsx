import { useTranslation } from 'react-i18next';
import type { ProtectionAttr } from '@/lib/rights/rightsCatalog';
import { getProtectionStatus } from '@/utils/equalityScore';
import { Check, Minus, X } from 'lucide-react';

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
 * all. Each cell now carries visually-hidden text instead.
 *
 * NOT `aria-label` — a bare <span> has no implicit ARIA role, and aria-label
 * is prohibited on role-less elements. Adding one here produced 8 serious
 * `aria-prohibited-attr` violations in the axe sweep. Giving the span
 * `role="img"` would also be valid, but sr-only text needs no ARIA at all and
 * survives a reader that ignores the role.
 */
export function ProtectionCells({
  data,
  attrs = ALL_ATTRS,
  presentation = 'compact',
}: {
  data: Record<string, unknown> | null | undefined;
  attrs?: readonly ProtectionAttr[];
  presentation?: 'compact' | 'table';
}) {
  const { t } = useTranslation();
  const status = getProtectionStatus(data);

  return (
    <div
      className={
        presentation === 'table' ? 'grid shrink-0 grid-cols-4 gap-2' : 'flex shrink-0 gap-1'
      }
    >
      {attrs.map((attr) => {
        const value = status[attr];
        const isYes = value === 'Yes';
        const isNo = value === 'No';
        const full = t(`rights.attr.${attr}.full`, ATTR_FULL[attr]);
        return (
          <span
            key={attr}
            title={`${attr.toUpperCase()}: ${value}`}
            className={
              (presentation === 'table'
                ? 'flex h-8 w-16 items-center justify-center rounded-element '
                : 'flex h-5 w-6 items-center justify-center rounded-badge text-2xs font-semibold ') +
              (isYes
                ? 'bg-foreground text-background'
                : isNo
                  ? 'bg-surface-container-highest text-muted-foreground'
                  : 'bg-muted text-muted-foreground')
            }
          >
            {presentation === 'table' ? (
              isYes ? (
                <Check size={16} aria-hidden />
              ) : isNo ? (
                <X size={16} aria-hidden />
              ) : (
                <Minus size={16} aria-hidden />
              )
            ) : (
              <span aria-hidden="true">{attr.toUpperCase()}</span>
            )}
            <span className="sr-only">{`${full}: ${value}`}</span>
          </span>
        );
      })}
    </div>
  );
}

/** The column header strip above a run of ProtectionCells. */
export function ProtectionCellsHeader({
  attrs = ALL_ATTRS,
  presentation = 'compact',
}: {
  attrs?: readonly ProtectionAttr[];
  presentation?: 'compact' | 'table';
}) {
  const { t } = useTranslation();
  return (
    <div>
      {presentation === 'table' && (
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs2 text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Check size={12} aria-hidden />
            {t('rights.value.yes', 'Yes')}
          </span>
          <span className="inline-flex items-center gap-1">
            <X size={12} aria-hidden />
            {t('rights.value.no', 'No')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Minus size={12} aria-hidden />
            {t('country.rights.noData', 'No data')}
          </span>
        </div>
      )}
      <div
        className={presentation === 'table' ? 'grid grid-cols-4 gap-2' : 'flex gap-1'}
        aria-hidden="true"
      >
        {attrs.map((attr) => (
          <span
            key={attr}
            className={
              presentation === 'table'
                ? 'w-16 break-words text-center text-xs2 font-medium leading-snug text-muted-foreground'
                : 'w-6 text-center text-3xs font-semibold text-muted-foreground'
            }
          >
            {presentation === 'table'
              ? t(`rights.attr.${attr}.full`, ATTR_FULL[attr])
              : attr.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

export default ProtectionCells;
