import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { StatusGlyph } from './StatusGlyph';
import { readRightValue } from '@/lib/rights/rightsValue';

/**
 * One legal fact: icon + label left, glyph + value chip right.
 *
 * The chip renders `rights.value.<key>` with the raw source string as the
 * i18n fallback. That ordering matters: an ILGA value we have not mapped yet
 * still renders in the source's own words rather than vanishing or showing a
 * key, and a translated locale stops leaking English legal vocabulary
 * ("Not banned", "Civil Union Only") into /de, /fr and the other nine.
 */
export function RightRow({
  label,
  icon: Icon,
  value,
  severeNegative = false,
}: {
  label: string;
  icon: ElementType;
  value: string | boolean | null | undefined;
  severeNegative?: boolean;
}) {
  const { t } = useTranslation();
  const { kind, valueKey, raw } = readRightValue(value, severeNegative);

  return (
    <div className="flex items-center gap-4 py-2">
      <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-13 font-medium leading-snug">{label}</p>
      {raw ? (
        <div className="flex shrink-0 items-center gap-2">
          <StatusGlyph kind={kind} />
          <Badge variant={kind === 'severe' ? 'destructive' : 'secondary'} className="text-2xs">
            {valueKey ? t(`rights.value.${valueKey}`, raw) : raw}
          </Badge>
        </div>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('country.rights.noData', 'No data')}
        </span>
      )}
    </div>
  );
}

export default RightRow;
