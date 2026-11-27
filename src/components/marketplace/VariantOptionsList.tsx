import { useTranslation } from 'react-i18next';
import { SingleSection } from '@/components/transit/SinglePage';
import type { ListingVariant } from './VariantAvailability';

function optionText(v: ListingVariant): string {
  const opts = v.options && typeof v.options === 'object' ? Object.values(v.options) : [];
  const joined = opts.filter((o) => typeof o === 'string' && o.trim()).join(' · ');
  return joined || v.title || '';
}

/**
 * The seller's options for a service, ticket or membership, with each one's
 * price — as INFORMATION. There is no cart here: the choice is made on the
 * seller's site, so this is a plain list, never a selector that pretends to
 * configure a purchase. Renders nothing when the options carry no labels.
 */
export function VariantOptionsList({
  variants,
  currency,
}: {
  variants: ListingVariant[];
  currency?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const rows = variants
    .map((v) => ({ id: v.id, label: optionText(v), price: v.price, cur: v.currency ?? currency }))
    .filter((r) => r.label);
  if (rows.length < 2) return null;

  const fmt = (price: string | number | null, cur: string | null | undefined) => {
    if (price == null || !cur) return null;
    try {
      return new Intl.NumberFormat(i18n.language, { style: 'currency', currency: cur }).format(
        Number(price),
      );
    } catch {
      return `${price} ${cur}`;
    }
  };

  return (
    <SingleSection
      id="listing-options"
      title={t('marketplace.optionsHeading', 'Options offered')}
      note={t('marketplace.optionsNote', 'Choose an option on the seller site.')}
    >
      <ul className="m-0 list-none divide-y divide-border-hairline rounded-element bg-muted p-0">
        {rows.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-4 px-4 py-2 text-15">
            <span>{r.label}</span>
            <span className="tabular-nums text-muted-foreground">{fmt(r.price, r.cur)}</span>
          </li>
        ))}
      </ul>
    </SingleSection>
  );
}
