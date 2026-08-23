import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import type { TagMarketplaceItem } from '@/hooks/useTagContent';

const MAX_ITEMS = 8;

function priceLine(item: TagMarketplaceItem): string | null {
  if (item.price == null) return null;
  const currency = (item.currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(item.price);
  } catch {
    return `${item.price} ${currency}`;
  }
}

/**
 * The Shop rail on /tags/:slug — real product cards (image, brand eyebrow,
 * price) instead of the generic NestedEntityCard. Whole-card click is the
 * overlay-sibling pattern (never an <a> wrapping the card — nested-interactive
 * is e2e-gated). "Shop all" goes into FILTERED /marketplace browse: when ≥60%
 * of the rail shares one department the link pre-selects it, so a leather tag
 * lands on leather fetish gear rather than the whole catalogue.
 */
export function TagShopRail({ items, tagSlug }: { items: TagMarketplaceItem[]; tagSlug: string }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  const visible = items.slice(0, MAX_ITEMS);

  const deptCounts = new Map<string, number>();
  for (const m of visible) {
    if (m.department) deptCounts.set(m.department, (deptCounts.get(m.department) ?? 0) + 1);
  }
  const [topDept, topCount] = [...deptCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const dominantDept = topDept && topCount / visible.length >= 0.6 ? topDept : null;
  const seeAllHref = `/marketplace?tags=${encodeURIComponent(tagSlug)}${
    dominantDept ? `&dept=${encodeURIComponent(dominantDept)}` : ''
  }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((m) => {
          const eyebrow = m.brand ?? m.business_name ?? null;
          const price = priceLine(m);
          return (
            <CardHoverEffect key={m.id} className="relative h-full">
              <Card className="flex h-full flex-col overflow-hidden">
                {m.image_url && (
                  <Image
                    imageUrl={m.image_url}
                    alt=""
                    aspect="square"
                    rounded="none"
                    fallbackEntityType="marketplace"
                    fallbackKey={m.id}
                  />
                )}
                <div className="flex flex-1 flex-col gap-1 p-4">
                  {eyebrow && (
                    <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                      {eyebrow}
                    </p>
                  )}
                  <p className="line-clamp-2 text-13 font-bold leading-snug">{m.title}</p>
                  {price && <p className="mt-auto pt-1 text-13 tabular-nums">{price}</p>}
                </div>
              </Card>
              {m.slug && (
                <LocalizedLink
                  to={`/marketplace/${m.slug}`}
                  aria-label={m.title}
                  className="absolute inset-0 no-underline"
                />
              )}
            </CardHoverEffect>
          );
        })}
      </div>
      <LocalizedLink
        to={seeAllHref}
        className="self-start text-13 font-bold underline underline-offset-4"
      >
        {t('tags.detail.shopAll', 'Shop all')} <span aria-hidden="true">&rarr;</span>
      </LocalizedLink>
    </div>
  );
}
