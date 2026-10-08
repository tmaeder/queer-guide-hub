/**
 * A `kind='menu'` workbook step — a negotiation menu.
 *
 * THIS COMPONENT STORES NOTHING OF ITS OWN.
 *
 * A menu step rates `kink_items` into `kink_ratings` through the existing
 * hooks, so the whole step is a thin layout over machinery that already exists:
 * the 6-value scale (favorite | like | curious | maybe | no | hard_limit), the
 * "talk about it first" flag, the per-category visibility tiers, the veto-aware
 * `kink_compare` reveal, the expiring share links, the GDPR export and the
 * moderation path. Building a second rating store for workbooks would have
 * duplicated every one of those and then drifted from it.
 *
 * The consequence worth knowing: a rating entered HERE shows up in
 * /tools/checklist, and vice versa. That is intended — it is one answer to one
 * question, not two copies — and it is why the step says so on screen rather
 * than letting a reader discover it.
 */

import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KinkRatingControl } from '@/components/kinks/KinkRatingControl';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import {
  useMyKinkRatings,
  useUpsertKinkRatings,
  useDeleteKinkRating,
} from '@/hooks/useKinkRatings';
import {
  AXIS_SIDES,
  itemAxis,
  kinkLabel,
  type KinkRatingValue,
  type KinkSide,
} from '@/lib/kinks/types';

export function WorkbookMenuStep({
  categorySlug,
  heading,
  help,
}: {
  categorySlug: string;
  heading?: string | null;
  help?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  const { data: taxonomy } = useKinkTaxonomy();
  const { data: ratings } = useMyKinkRatings();
  const upsert = useUpsertKinkRatings();
  const remove = useDeleteKinkRating();

  if (!taxonomy) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading menu">
        <Skeleton className="h-6 w-2/5" />
        <Skeleton className="h-24 w-full rounded-container" />
      </div>
    );
  }

  const category = taxonomy.categories.find((c) => c.slug === categorySlug);
  // A menu step whose category is missing or retired renders an honest absence.
  // Silently showing nothing would be indistinguishable from a rated-nothing
  // step, and the step is on screen because the author put it there.
  if (!category) {
    return (
      <p className="text-13 italic text-muted-foreground">
        {t('workbooks.menuUnavailable', 'This menu is not available right now.')}
      </p>
    );
  }

  const items = taxonomy.itemsByCategory.get(category.id) ?? [];

  const handleRate = (itemId: string, side: KinkSide, rating: KinkRatingValue | null) => {
    const existing = ratings?.get(`${itemId}:${side}`);
    if (rating === null) {
      remove.mutate({ item_id: itemId, side });
      return;
    }
    upsert.mutate([
      { item_id: itemId, side, rating, needs_discussion: existing?.needs_discussion ?? false },
    ]);
  };

  const handleDiscussion = (itemId: string, side: KinkSide, flag: boolean) => {
    const existing = ratings?.get(`${itemId}:${side}`);
    if (!existing) return;
    upsert.mutate([{ item_id: itemId, side, rating: existing.rating, needs_discussion: flag }]);
  };

  return (
    <div>
      <h3 className="font-display text-headline leading-tight">
        {heading ?? kinkLabel(category, lang)}
      </h3>
      {(help || category.description) && (
        <p className="mt-2 text-sm text-muted-foreground">{help ?? category.description}</p>
      )}
      <p className="mt-2 text-2xs uppercase tracking-label text-muted-foreground">
        {t(
          'workbooks.menuSharedWithChecklist',
          'These ratings are your interests & boundaries list. They also appear in /tools/checklist',
        )}
      </p>

      <ul className="mt-6 list-none space-y-6 p-0">
        {items.map((item) => {
          const sides = AXIS_SIDES[itemAxis(item, category)];
          return (
            <li key={item.id} className="border-b border-border-hairline pb-6 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-15 font-bold">{kinkLabel(item, lang)}</h4>
                {item.discussion_recommended && (
                  <Badge variant="outline" className="shrink-0 gap-2 rounded-badge text-2xs">
                    <MessageCircle className="h-3 w-3" aria-hidden="true" />
                    {t('workbooks.discussFirst', 'Discuss first')}
                  </Badge>
                )}
              </div>
              {item.description && (
                <p className="mt-2 text-13 text-muted-foreground">
                  {item.description_i18n?.[lang] ?? item.description}
                </p>
              )}
              <div className="mt-4 space-y-2">
                {sides.map((side) => {
                  const row = ratings?.get(`${item.id}:${side}`);
                  return (
                    <KinkRatingControl
                      key={side}
                      side={side}
                      rating={row?.rating ?? null}
                      needsDiscussion={row?.needs_discussion ?? false}
                      onRate={(r) => handleRate(item.id, side, r)}
                      onToggleDiscussion={(f) => handleDiscussion(item.id, side, f)}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-13 opacity-75">
        {t(
          'workbooks.menuVetoNote',
          'Your no and your hard limit are never shown to anyone. They silently remove an item from any comparison instead.',
        )}
      </p>
    </div>
  );
}
